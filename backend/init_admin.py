from app.database import SessionLocal, engine, Base
from app.models.user import User
from app.auth.jwt import get_password_hash

# Ensure tables exist
Base.metadata.create_all(bind=engine)

def init_db():
    db = SessionLocal()
    try:
        # Check if admin exists
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            print("Creating admin user...")
            admin_user = User(
                username="admin",
                password_hash=get_password_hash("admin"),
                role="admin"
            )
            db.add(admin_user)
            db.commit()
            print("Admin user created (admin/admin)")
        else:
            print("Admin user already exists.")
            
        # Optional: Add demo teacher and student
        if not db.query(User).filter(User.username == "teacher").first():
             teacher = User(username="teacher", password_hash=get_password_hash("teacher"), role="teacher")
             db.add(teacher)
        
        if not db.query(User).filter(User.username == "student").first():
             student = User(username="student", password_hash=get_password_hash("student"), role="student")
             db.add(student)
             
        db.commit()

    except Exception as e:
        print(f"Error initializing DB: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
