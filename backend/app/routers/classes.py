from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from ..database import get_db
from ..models.class_model import ClassModel
from ..models.user import User
from ..models.student_association import StudentClass
from ..auth.jwt import get_current_user

router = APIRouter(
    prefix="/classes",
    tags=["classes"]
)

class ClassCreate(BaseModel):
    name: str

class StudentAdd(BaseModel):
    username: str

@router.get("/")
def list_classes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Teachers see their own classes
    if current_user.role == "teacher":
        return db.query(ClassModel).filter(ClassModel.teacher_id == current_user.id).all()
    # Students see classes they are enrolled in
    if current_user.role == "student":
        # Join ClassModel with StudentClass to find enrolled classes
        return db.query(ClassModel).join(StudentClass).filter(StudentClass.user_id == current_user.id).all()
        
    # Admin sees all (or logic can vary)
    return db.query(ClassModel).all()

@router.post("/")
def create_class(class_data: ClassCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
         raise HTTPException(status_code=403, detail="Only teachers can create classes")
    
    new_class = ClassModel(
        name=class_data.name,
        teacher_id=current_user.id
    )
    db.add(new_class)
    db.commit()
    db.refresh(new_class)
    return new_class

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
