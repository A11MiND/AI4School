import sys
import os

# Add current directory to sys.path to ensure 'app' can be imported
sys.path.append(os.getcwd())

from app.database import SessionLocal, engine, Base
from app.models import User
from app.auth.jwt import get_password_hash

def seed():
    print("Recreating database...")
    # Drop all tables logic is optional if file deleted, but good practice
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    print("Creating users...")
    
    # 1. Admin (Teacher)
    user1 = User(
        username="admin", 
        password_hash=get_password_hash("admin"), 
        role="teacher" 
    )
    
    # 2. Admin1 (Teacher)
    user2 = User(
        username="admin1", 
        password_hash=get_password_hash("admin1"), 
        role="teacher"
    )

    # 3. Student (Student)
    user3 = User(
        username="student", 
        password_hash=get_password_hash("student"), 
        role="student"
    )

    db.add(user1)
    db.add(user2)
    db.add(user3)
    
    db.commit()
    print("Seeding complete: admin(teacher), admin1(teacher), student(student).")
    db.close()

if __name__ == "__main__":
    seed()
