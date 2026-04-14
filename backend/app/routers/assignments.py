from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.assignment import Assignment
from ..models.user import User
from ..models.class_model import ClassModel
from ..models.paper import Paper
from ..models.student_association import StudentClass
from ..auth.jwt import get_current_user

router = APIRouter(
    prefix="/assignments",
    tags=["assignments"]
)

class AssignmentCreate(BaseModel):
    paper_id: int
    class_id: Optional[int] = None
    student_id: Optional[int] = None
    deadline: Optional[str] = None # ISO format string
    duration_minutes: Optional[int] = None
    max_attempts: Optional[int] = 1


@router.get("")
@router.get("/")
def list_assignments(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role in ["teacher", "admin"]:
        query = db.query(Assignment)
        if current_user.role == "teacher":
            query = query.join(Paper, Paper.id == Assignment.paper_id).filter(Paper.created_by == current_user.id)
        assignments = query.order_by(Assignment.assigned_at.desc()).all()
    else:
        class_ids = [
            class_id
            for (class_id,) in db.query(StudentClass.class_id)
            .filter(StudentClass.user_id == current_user.id)
            .all()
        ]
        query = db.query(Assignment)
        if class_ids:
            query = query.filter((Assignment.student_id == current_user.id) | (Assignment.class_id.in_(class_ids)))
        else:
            query = query.filter(Assignment.student_id == current_user.id)
        assignments = query.order_by(Assignment.assigned_at.desc()).all()

    result = []
    for a in assignments:
        item = {
            "id": a.id,
            "paper_id": a.paper_id,
            "assigned_at": a.assigned_at,
            "deadline": a.deadline,
            "duration_minutes": a.duration_minutes,
            "max_attempts": a.max_attempts,
            "target_name": "Unknown",
        }
        if a.class_id:
            cls = db.query(ClassModel).filter(ClassModel.id == a.class_id).first()
            item["target_name"] = f"Class: {cls.name}" if cls else "Unknown Class"
            item["type"] = "class"
        elif a.student_id:
            stu = db.query(User).filter(User.id == a.student_id).first()
            item["target_name"] = f"Student: {stu.username}" if stu else "Unknown Student"
            item["type"] = "student"
        result.append(item)

    return result

@router.post("")
@router.post("/")
def create_assignment(data: AssignmentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only teachers can assign papers")
    
    if not data.class_id and not data.student_id:
        raise HTTPException(status_code=400, detail="Must assign to a class or a student")

    from datetime import datetime
    deadline_dt = datetime.fromisoformat(data.deadline.replace('Z', '+00:00')) if data.deadline else None

    new_assign = Assignment(
        paper_id=data.paper_id,
        class_id=data.class_id,
        student_id=data.student_id,
        deadline=deadline_dt,
        duration_minutes=data.duration_minutes,
        max_attempts=data.max_attempts
    )
    db.add(new_assign)
    db.commit()
    return {"message": "Paper assigned successfully"}

@router.get("/paper/{paper_id}")
def get_paper_assignments(paper_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    assignments = db.query(Assignment).filter(Assignment.paper_id == paper_id).all()
    result = []
    for a in assignments:
        item = {
            "id": a.id,
            "assigned_at": a.assigned_at,
            "deadline": a.deadline,
            "duration_minutes": a.duration_minutes,
            "max_attempts": a.max_attempts,
            "target_name": "Unknown"
        }
        if a.class_id:
            cls = db.query(ClassModel).filter(ClassModel.id == a.class_id).first()
            item["target_name"] = f"Class: {cls.name}" if cls else "Unknown Class"
            item["type"] = "class"
        elif a.student_id:
            stu = db.query(User).filter(User.id == a.student_id).first()
            item["target_name"] = f"Student: {stu.username}" if stu else "Unknown Student"
            item["type"] = "student"
        
        result.append(item)
    return result

@router.delete("/{assignment_id}")
def delete_assignment(assignment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    assign = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assign:
        raise HTTPException(status_code=404, detail="Assignment not found")
        
    db.delete(assign)
    db.commit()
    return {"message": "Assignment revoked"}
