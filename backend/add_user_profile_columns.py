from app.database import engine
from sqlalchemy import text
import sys
import os

# Add parent directory to path so we can import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def add_columns():
    try:
        with engine.connect() as conn:
            # Add full_name
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR"))
                print("Added full_name column")
            except Exception as e:
                print(f"full_name might already exist: {e}")
                
            # Add avatar_url
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR"))
                print("Added avatar_url column")
            except Exception as e:
                print(f"avatar_url might already exist: {e}")
                
            conn.commit()
            print("Migration completed")
    except Exception as e:
        print(f"Error connecting to database: {e}")

if __name__ == "__main__":
    add_columns()
