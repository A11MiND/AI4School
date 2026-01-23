import sys
import os
import random
from datetime import datetime, timedelta

# Add current directory to sys.path
sys.path.append(os.getcwd())

from app.database import SessionLocal, engine, Base
from app.models.user import User
from app.models.class_model import ClassModel
from app.models.paper import Paper
from app.models.question import Question
from app.models.submission import Submission, Answer
from app.auth.jwt import get_password_hash

def seed_analytics():
    db = SessionLocal()
    print("Seeding Analytics Data...")

    # 1. Get Teacher and Student
    teacher = db.query(User).filter(User.username == "admin").first()
    student = db.query(User).filter(User.username == "student").first()
    
    if not teacher or not student:
        print("Please run seed.py first.")
        return

    # 2. Create Class
    test_class = db.query(ClassModel).filter(ClassModel.name == "Math 101").first()
    if not test_class:
        test_class = ClassModel(name="Math 101", teacher_id=teacher.id)
        db.add(test_class)
        db.commit()
    
    # 3. Create Paper First
    paper = Paper(
        title="Diagnostic Test 1",
        class_id=test_class.id,
        created_by=teacher.id,
        article_content="Solve the following problems..."
    )
    db.add(paper)
    db.commit()

    # 4. Create Questions linked to Paper
    skills = ["Algebra", "Geometry", "Calculus"]
    questions = []
    
    for i in range(10):
        skill = skills[i % 3] # Rotate skills
        q = Question(
            question_text=f"Sample Question {i+1} ({skill})",
            question_type="single_choice",
            difficulty=1, # Integer expected
            skill_tag=skill,
            correct_answer_schema={"correct": "A"},
            paper_id=paper.id
        )
        questions.append(q)
        db.add(q)
    
    db.commit()

    # 5. Create Submission
    # Let's make Geometry weak
    score = 0
    total = len(questions)
    
    submission = Submission(
        student_id=student.id,
        paper_id=paper.id,
        score=0.0
    )
    db.add(submission)
    db.commit()

    correct_count = 0
    
    for q in questions:
        is_correct = True
        # Fail all Geometry questions
        if q.skill_tag == "Geometry":
            is_correct = False
        # Random others
        elif random.random() < 0.2:
            is_correct = False
            
        if is_correct:
            correct_count += 1
            
        ans = Answer(
            submission_id=submission.id,
            question_id=q.id,
            answer="A" if is_correct else "B",
            is_correct=is_correct,
            score=1.0 if is_correct else 0.0
        )
        db.add(ans)
    
    final_score = (correct_count / total) * 100
    submission.score = final_score
    db.add(submission)
    
    db.commit()
    print(f"Analytics Data Seeded. Student Score: {final_score}. Weak Skill: Geometry.")
    db.close()

if __name__ == "__main__":
    seed_analytics()
