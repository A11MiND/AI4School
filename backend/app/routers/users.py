from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from ..database import get_db
from ..models.user import User
from ..auth.jwt import get_current_user, get_password_hash
import os
import uuid
import shutil

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

class UserProfileUpdate(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None

@router.get("/me")
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "full_name": current_user.full_name,
        "avatar_url": current_user.avatar_url
    }

@router.put("/me")
def update_user_profile(
    data: UserProfileUpdate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # If changing username, check uniqueness
    if data.username and data.username != current_user.username:
        existing = db.query(User).filter(User.username == data.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = data.username
    
    if data.full_name is not None:
        current_user.full_name = data.full_name
        
    if data.password:
        current_user.password_hash = get_password_hash(data.password)
        
    db.commit()
    db.refresh(current_user)
    return {
        "message": "Profile updated successfully",
        "username": current_user.username,
        "full_name": current_user.full_name
    }

@router.post("/me/avatar")
def upload_avatar(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    upload_dir = "uploads/avatars"
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
        
    # Generate unique filename
    ext = file.filename.split('.')[-1]
    filename = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Update DB
    # Store relative path for frontend access
    relative_path = f"uploads/avatars/{filename}"
    current_user.avatar_url = relative_path
    db.commit()
    
    return {"avatar_url": relative_path}
