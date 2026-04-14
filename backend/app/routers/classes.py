from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import secrets
import string
import datetime
from ..database import get_db
from ..models.class_model import ClassModel
from ..models.class_invite_code import ClassInviteCode
from ..models.user import User
from ..models.student_association import StudentClass
from ..auth.jwt import get_current_user
from ..auth.jwt import get_password_hash

router = APIRouter(
    prefix="/classes",
    tags=["classes"]
)

class ClassCreate(BaseModel):
    name: str

class StudentAdd(BaseModel):
    username: str


class StudentBulkItem(BaseModel):
    username: str
    password: Optional[str] = None
    full_name: Optional[str] = None


class StudentBulkAddRequest(BaseModel):
    students: List[StudentBulkItem]
    auto_create_missing: bool = True
    default_password: Optional[str] = None


class JoinClassRequest(BaseModel):
    invite_code: str


class InviteCodeCreateRequest(BaseModel):
    expires_in_hours: Optional[int] = 168
    one_time: bool = False
    max_uses: Optional[int] = None


class InviteCodeRefreshRequest(BaseModel):
    expires_in_hours: Optional[int] = 168
    one_time: bool = False


class InviteCodeResponse(BaseModel):
    id: int
    code: str
    class_id: int
    expires_at: Optional[datetime.datetime] = None
    max_uses: Optional[int] = None
    used_count: int
    revoked: bool
    revoked_at: Optional[datetime.datetime] = None
    created_at: Optional[datetime.datetime] = None


def _generate_invite_code(db: Session, length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        candidate = "".join(secrets.choice(alphabet) for _ in range(length))
        exists = db.query(ClassInviteCode).filter(ClassInviteCode.code == candidate).first()
        if not exists:
            return candidate
    raise HTTPException(status_code=500, detail="Failed to generate invite code")


def _get_current_invite_code(db: Session, class_id: int) -> Optional[str]:
    now = datetime.datetime.now(datetime.timezone.utc)
    row = db.query(ClassInviteCode).filter(
        ClassInviteCode.class_id == class_id,
        ClassInviteCode.revoked == False,
    ).order_by(ClassInviteCode.created_at.desc()).first()
    if not row:
        return None
    if row.expires_at is not None and row.expires_at < now:
        return None
    if row.max_uses is not None and row.used_count >= row.max_uses:
        return None
    return row.code


def _serialize_class(db: Session, class_row: ClassModel):
    return {
        "id": class_row.id,
        "name": class_row.name,
        "teacher_id": class_row.teacher_id,
        "invite_code": _get_current_invite_code(db, class_row.id),
    }


def _build_expiry(expires_in_hours: Optional[int]) -> Optional[datetime.datetime]:
    if expires_in_hours is None:
        return None
    return datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=expires_in_hours)


def _create_invite_code_record(
    db: Session,
    class_id: int,
    created_by: int,
    expires_in_hours: Optional[int],
    one_time: bool,
    max_uses: Optional[int],
) -> ClassInviteCode:
    uses = 1 if one_time else max_uses
    if uses is not None and uses <= 0:
        raise HTTPException(status_code=400, detail="max_uses must be positive")

    invite = ClassInviteCode(
        class_id=class_id,
        code=_generate_invite_code(db),
        created_by=created_by,
        expires_at=_build_expiry(expires_in_hours),
        max_uses=uses,
        used_count=0,
        revoked=False,
    )
    db.add(invite)
    return invite

@router.get("")
@router.get("/")
def list_classes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Teachers see their own classes
    if current_user.role == "teacher":
        classes = db.query(ClassModel).filter(ClassModel.teacher_id == current_user.id).all()
        return [_serialize_class(db, c) for c in classes]
    # Students see classes they are enrolled in
    if current_user.role == "student":
        # Join ClassModel with StudentClass to find enrolled classes
        classes = db.query(ClassModel).join(StudentClass).filter(StudentClass.user_id == current_user.id).all()
        return [_serialize_class(db, c) for c in classes]
        
    # Admin sees all (or logic can vary)
    classes = db.query(ClassModel).all()
    return [_serialize_class(db, c) for c in classes]

@router.post("")
@router.post("/")
def create_class(class_data: ClassCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
         raise HTTPException(status_code=403, detail="Only teachers can create classes")
    
    new_class = ClassModel(
        name=class_data.name,
        teacher_id=current_user.id,
    )
    db.add(new_class)
    db.flush()
    _create_invite_code_record(
        db=db,
        class_id=new_class.id,
        created_by=current_user.id,
        expires_in_hours=168,
        one_time=False,
        max_uses=None,
    )
    db.commit()
    db.refresh(new_class)
    return _serialize_class(db, new_class)


@router.post("/{class_id}/invite-code/refresh")
def refresh_invite_code(
    class_id: int,
    payload: InviteCodeRefreshRequest = InviteCodeRefreshRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can refresh invite codes")

    class_ = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")
    if current_user.role == "teacher" and class_.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    active_codes = db.query(ClassInviteCode).filter(
        ClassInviteCode.class_id == class_.id,
        ClassInviteCode.revoked == False,
    ).all()
    now = datetime.datetime.now(datetime.timezone.utc)
    for code_row in active_codes:
        if code_row.expires_at is not None and code_row.expires_at < now:
            continue
        code_row.revoked = True
        code_row.revoked_at = now

    invite = _create_invite_code_record(
        db=db,
        class_id=class_.id,
        created_by=current_user.id,
        expires_in_hours=payload.expires_in_hours,
        one_time=payload.one_time,
        max_uses=None,
    )
    db.commit()
    return {"class_id": class_.id, "invite_code": invite.code}


@router.post("/{class_id}/invite-codes", response_model=InviteCodeResponse)
def create_invite_code(
    class_id: int,
    payload: InviteCodeCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can create invite codes")

    class_ = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")
    if current_user.role == "teacher" and class_.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    invite = _create_invite_code_record(
        db=db,
        class_id=class_.id,
        created_by=current_user.id,
        expires_in_hours=payload.expires_in_hours,
        one_time=payload.one_time,
        max_uses=payload.max_uses,
    )
    db.commit()
    db.refresh(invite)
    return invite


@router.get("/{class_id}/invite-codes", response_model=List[InviteCodeResponse])
def list_invite_codes(class_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can view invite history")

    class_ = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")
    if current_user.role == "teacher" and class_.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    return db.query(ClassInviteCode).filter(
        ClassInviteCode.class_id == class_id
    ).order_by(ClassInviteCode.created_at.desc()).all()


@router.post("/invite-codes/{invite_id}/revoke")
def revoke_invite_code(invite_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can revoke invite codes")

    invite = db.query(ClassInviteCode).filter(ClassInviteCode.id == invite_id).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite code not found")

    class_ = db.query(ClassModel).filter(ClassModel.id == invite.class_id).first()
    if class_ is None:
        raise HTTPException(status_code=404, detail="Class not found")
    if current_user.role == "teacher" and class_.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    if invite.revoked:
        return {"message": "Invite code already revoked", "id": invite.id}

    invite.revoked = True
    invite.revoked_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    return {"message": "Invite code revoked", "id": invite.id}


@router.post("/join")
def join_class_with_code(payload: JoinClassRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can join classes")

    invite_code = (payload.invite_code or "").strip().upper()
    if not invite_code:
        raise HTTPException(status_code=400, detail="Invite code is required")

    invite = db.query(ClassInviteCode).filter(ClassInviteCode.code == invite_code).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    if invite.revoked:
        raise HTTPException(status_code=400, detail="Invite code is revoked")

    now = datetime.datetime.now(datetime.timezone.utc)
    if invite.expires_at is not None and invite.expires_at < now:
        raise HTTPException(status_code=400, detail="Invite code has expired")
    if invite.max_uses is not None and invite.used_count >= invite.max_uses:
        raise HTTPException(status_code=400, detail="Invite code has reached usage limit")

    class_ = db.query(ClassModel).filter(ClassModel.id == invite.class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    exists = db.query(StudentClass).filter(
        StudentClass.user_id == current_user.id,
        StudentClass.class_id == class_.id,
    ).first()
    if exists:
        return {"message": "Already joined", "class_id": class_.id, "class_name": class_.name}

    db.add(StudentClass(user_id=current_user.id, class_id=class_.id))
    invite.used_count += 1
    db.commit()
    return {"message": "Joined class", "class_id": class_.id, "class_name": class_.name}

@router.get("/{class_id}/students")
def get_class_students(class_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify permission...
    class_ = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")
        
    # Using the relationship defined in models/class_model.py: students = relationship("StudentClass", ...)
    # students is a list of StudentClass association objects
    students_list = []
    for sc in class_.students:
        students_list.append({
            "id": sc.user.id,
            "username": sc.user.username,
            "role": sc.user.role
        })
    return students_list

@router.post("/{class_id}/students")
def add_student(class_id: int, student: StudentAdd, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 1. Check class ownership
    class_ = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")
    if current_user.role == "teacher" and class_.teacher_id != current_user.id:
         raise HTTPException(status_code=403, detail="Not your class")

    # 2. Find student user
    user = db.query(User).filter(User.username == student.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Student username not found")
    if user.role != "student":
        raise HTTPException(status_code=400, detail="User is not a student")

    # 3. Check if already in class
    exists = db.query(StudentClass).filter(StudentClass.user_id == user.id, StudentClass.class_id == class_id).first()
    if exists:
        return {"message": "Student already in class"}

    # 4. Add to class
    assoc = StudentClass(user_id=user.id, class_id=class_id)
    db.add(assoc)
    db.commit()
    return {"message": "Student added"}


@router.post("/{class_id}/students/bulk")
def add_students_bulk(
    class_id: int,
    payload: StudentBulkAddRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    class_ = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")
    if current_user.role == "teacher" and class_.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    if not payload.students:
        raise HTTPException(status_code=400, detail="students cannot be empty")

    normalized_rows = []
    seen_usernames = set()
    failed = []
    for row in payload.students:
        username = (row.username or "").strip()
        if not username:
            failed.append({"username": "", "reason": "Empty username"})
            continue
        if username in seen_usernames:
            failed.append({"username": username, "reason": "Duplicate username in request"})
            continue
        seen_usernames.add(username)
        normalized_rows.append({
            "username": username,
            "password": row.password,
            "full_name": row.full_name,
        })

    if not normalized_rows:
        return {
            "total": len(payload.students),
            "added_to_class": 0,
            "already_in_class": 0,
            "created_accounts": 0,
            "failed": failed,
        }

    usernames = [row["username"] for row in normalized_rows]
    existing_users = db.query(User).filter(User.username.in_(usernames)).all()
    user_by_username = {u.username: u for u in existing_users}

    created_accounts = 0
    already_in_class = 0
    added_to_class = 0

    candidate_user_ids = [u.id for u in user_by_username.values()]
    existing_assoc_ids = set()
    if candidate_user_ids:
        existing_assoc_ids = {
            user_id
            for (user_id,) in db.query(StudentClass.user_id)
            .filter(StudentClass.class_id == class_id, StudentClass.user_id.in_(candidate_user_ids))
            .all()
        }

    for row in normalized_rows:
        username = row["username"]
        user = user_by_username.get(username)

        if user is None:
            if not payload.auto_create_missing:
                failed.append({"username": username, "reason": "Student username not found"})
                continue
            raw_password = (row.get("password") or payload.default_password or username).strip()
            if not raw_password:
                failed.append({"username": username, "reason": "Password cannot be empty for new account"})
                continue

            user = User(
                username=username,
                password_hash=get_password_hash(raw_password),
                role="student",
                full_name=(row.get("full_name") or None),
            )
            db.add(user)
            db.flush()
            user_by_username[username] = user
            created_accounts += 1

        if user.role != "student":
            failed.append({"username": username, "reason": "User is not a student"})
            continue

        if user.id in existing_assoc_ids:
            already_in_class += 1
            continue

        db.add(StudentClass(user_id=user.id, class_id=class_id))
        existing_assoc_ids.add(user.id)
        added_to_class += 1

    db.commit()

    return {
        "total": len(payload.students),
        "added_to_class": added_to_class,
        "already_in_class": already_in_class,
        "created_accounts": created_accounts,
        "failed": failed,
    }

@router.delete("/{class_id}")
def delete_class(class_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    cls = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
        
    if current_user.role == "teacher" and cls.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    # Check for dependent Papers and block deletion or cascade (here we block for safety, or we could assist)
    # But since user wants to fix the error, let's catch it.
    # Better yet, let's allow it but warn, or cascade manually if needed.
    # The user was getting a 500 error. The best fix for a smooth UX is to catch the IntegrityError 
    # and return a 400 saying "Cannot delete class with existing papers". 
    # OR we can cascade delete. Let's do cascade delete to be user friendly as this is a "Test" environment mostly.
    
    try:
        db.delete(cls)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Cannot delete class. It may have papers or students assigned. Please remove them first.")
        
    return {"message": "Class deleted"}

@router.delete("/{class_id}/students/{student_id}")
def remove_student(class_id: int, student_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify class ownership
    cls = db.query(ClassModel).filter(ClassModel.id == class_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if current_user.role == "teacher" and cls.teacher_id != current_user.id:
         raise HTTPException(status_code=403, detail="Not your class")
         
    assoc = db.query(StudentClass).filter(StudentClass.class_id == class_id, StudentClass.user_id == student_id).first()
    if not assoc:
        raise HTTPException(status_code=404, detail="Student not in this class")
        
    db.delete(assoc)
    db.commit()
    return {"message": "Student removed from class"}
