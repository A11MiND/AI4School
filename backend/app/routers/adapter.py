import json
import os
import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from jose import JWTError, jwt

from ..auth.jwt import ALGORITHM, SECRET_KEY, create_access_token, get_password_hash
from ..database import get_db
from ..models.control_plane import GlobalUserMap, LearningEvent, School, SchoolMembership
from ..models.user import User


router = APIRouter(prefix="/adapter", tags=["platform-adapter"])
adapter_bearer = HTTPBearer(auto_error=False)


class UserSyncItem(BaseModel):
    global_user_id: str
    platform: str = "ai4school"
    local_user_id: str
    school_id: Optional[int] = None
    class_id: Optional[int] = None
    role: str
    status: str = "active"


class UsersSyncRequest(BaseModel):
    users: List[UserSyncItem]


class ClassSyncRequest(BaseModel):
    platform: str = "ai4school"
    school_id: int
    classes: List[Dict[str, Any]] = []


class EntitlementsApplyRequest(BaseModel):
    platform: str = "ai4school"
    school_id: int
    entitlements: List[Dict[str, Any]] = []


class EventsExportRequest(BaseModel):
    events: List[Dict[str, Any]]


class SsoLaunchRequest(BaseModel):
    token: str


def _require_staff(user: User):
    if user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Teacher or admin access required")


def _adapter_token() -> str:
    return (os.getenv("ADAPTER_TOKEN") or os.getenv("ONE_FOR_ALL_ADAPTER_TOKEN") or "").strip()


def _launch_secret() -> str:
    return (os.getenv("ONE_FOR_ALL_LAUNCH_SECRET") or "one-for-all-dev-launch-secret").strip()


def _decode_launch_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, _launch_secret(), algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid launch token")
    if payload.get("iss") != "one-for-all" or payload.get("typ") != "platform_launch":
        raise HTTPException(status_code=401, detail="Invalid launch token claims")
    if payload.get("platform") != "ai4school":
        raise HTTPException(status_code=403, detail="Launch token is not for AI4School")
    return payload


def require_adapter_or_staff(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(adapter_bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    token = credentials.credentials if credentials else ""
    expected = _adapter_token()
    if expected and token == expected:
        return None
    if not token:
        raise HTTPException(status_code=401, detail="Missing adapter token or user token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: Optional[str] = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid adapter token or user token")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid user token")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    _require_staff(user)
    return user


@router.get("/health")
def adapter_health():
    return {
        "status": "ok",
        "platform": "ai4school",
        "capabilities": ["users.sync", "classes.sync", "entitlements.apply", "students.summary", "events.export"],
    }


@router.post("/sso/launch")
def sso_launch(payload: SsoLaunchRequest, db: Session = Depends(get_db)):
    claims = _decode_launch_token(payload.token)
    email = str(claims.get("email") or "").strip().lower()
    global_user_id = str(claims.get("global_user_id") or "").strip()
    role = str(claims.get("role") or "teacher").strip().lower()
    name = str(claims.get("name") or "").strip() or None
    source_school_id = str(claims.get("school_id") or "").strip()
    if not email or not global_user_id:
        raise HTTPException(status_code=400, detail="Launch token is missing user identity")
    if role not in {"teacher", "admin", "student"}:
        role = "teacher"

    school = None
    if source_school_id:
        external_ref = f"oneforall:{source_school_id}"
        school = db.query(School).filter(School.external_ref == external_ref).first()
        if not school:
            school = School(name=f"One For All School {source_school_id}", external_ref=external_ref, status="active")
            db.add(school)
            db.flush()

    user = db.query(User).filter(User.username == email).first()
    created = False
    if not user:
        user = User(
            username=email,
            password_hash=get_password_hash(secrets.token_urlsafe(24)),
            role=role if role in {"teacher", "admin", "student"} else "teacher",
            full_name=name,
        )
        db.add(user)
        db.flush()
        created = True
    else:
        user.role = role if role in {"teacher", "admin", "student"} else user.role
        if name:
            user.full_name = name

    if school:
        membership = db.query(SchoolMembership).filter(
            SchoolMembership.school_id == school.id,
            SchoolMembership.user_id == user.id,
            SchoolMembership.role == user.role,
        ).first()
        if not membership:
            membership = SchoolMembership(school_id=school.id, user_id=user.id, role=user.role, status="active")
            db.add(membership)
        else:
            membership.status = "active"

    mapping = db.query(GlobalUserMap).filter(
        GlobalUserMap.platform == "ai4school",
        GlobalUserMap.local_user_id == str(user.id),
    ).first()
    if not mapping:
        mapping = GlobalUserMap(platform="ai4school", local_user_id=str(user.id), global_user_id=global_user_id, role=user.role)
        db.add(mapping)
    mapping.global_user_id = global_user_id
    mapping.school_id = school.id if school else None
    mapping.role = user.role
    mapping.status = "active"
    db.commit()
    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "created": created,
        "global_user_id": global_user_id,
        "local_user_id": user.id,
    }


@router.post("/users/sync")
def sync_users(
    payload: UsersSyncRequest,
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_adapter_or_staff),
):
    upserted = 0
    for item in payload.users:
        row = db.query(GlobalUserMap).filter(
            GlobalUserMap.platform == item.platform,
            GlobalUserMap.local_user_id == item.local_user_id,
        ).first()
        if not row:
            row = GlobalUserMap(
                platform=item.platform,
                local_user_id=item.local_user_id,
                global_user_id=item.global_user_id,
                role=item.role,
            )
            db.add(row)
        row.global_user_id = item.global_user_id
        row.school_id = item.school_id
        row.class_id = item.class_id
        row.role = item.role
        row.status = item.status
        upserted += 1
    db.commit()
    return {"upserted": upserted}


@router.post("/classes/sync")
def sync_classes(
    payload: ClassSyncRequest,
    _: Optional[User] = Depends(require_adapter_or_staff),
):
    # Phase 1 stores class data in the source platform; this endpoint confirms contract compatibility.
    return {"accepted": len(payload.classes), "platform": payload.platform, "school_id": payload.school_id}


@router.post("/entitlements/apply")
def apply_entitlements(
    payload: EntitlementsApplyRequest,
    _: Optional[User] = Depends(require_adapter_or_staff),
):
    # Actual entitlement source of truth is the control plane subscription table.
    return {"accepted": len(payload.entitlements), "platform": payload.platform, "school_id": payload.school_id}


@router.get("/students/{global_user_id}/summary")
def get_student_summary(
    global_user_id: str,
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_adapter_or_staff),
):
    mappings = db.query(GlobalUserMap).filter(GlobalUserMap.global_user_id == global_user_id).all()
    events = db.query(LearningEvent).filter(LearningEvent.global_user_id == global_user_id).order_by(LearningEvent.id.desc()).limit(20).all()
    return {
        "global_user_id": global_user_id,
        "platform_mappings": [
            {
                "platform": item.platform,
                "local_user_id": item.local_user_id,
                "school_id": item.school_id,
                "class_id": item.class_id,
                "role": item.role,
                "status": item.status,
            }
            for item in mappings
        ],
        "recent_events": [
            {
                "id": event.id,
                "event_type": event.event_type,
                "platform": event.platform,
                "subject": event.subject,
                "payload": json.loads(event.payload_json or "{}"),
            }
            for event in events
        ],
    }


@router.post("/events/export")
def export_events(
    payload: EventsExportRequest,
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_adapter_or_staff),
):
    rows = []
    for event in payload.events:
        event_type = str(event.get("event_type") or "").strip()
        if not event_type:
            continue
        row = LearningEvent(
            event_type=event_type,
            global_user_id=event.get("global_user_id"),
            platform=event.get("platform") or "ai4school",
            local_user_id=event.get("local_user_id"),
            school_id=event.get("school_id"),
            class_id=event.get("class_id"),
            subject=event.get("subject"),
            payload_json=json.dumps(event.get("payload") or {}, ensure_ascii=False),
        )
        db.add(row)
        rows.append(row)
    db.commit()
    return {"accepted": len(rows)}
