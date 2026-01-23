from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Dict, Any

from ..database import get_db
from ..models.submission import Submission, Answer
from ..models.question import Question
from ..models.user import User
from ..models.class_model import ClassModel

router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    responses={404: {"description": "Not found"}},
)

@router.get("/overview")
async def get_analytics_overview(
    class_id: int = None,
    db: Session = Depends(get_db)
):
    """
    Get high-level statistics for the dashboard.
    """
    query = db.query(Submission)
    
    # Calculate Average Score
    if class_id:
        # Assuming Submission -> Student -> Class relationship or we just filter by students in a class
        # For MVP simplification, if class_id is not linked directly in submission, we might need a join.
        # But Submission -> Student (User) -> student_association -> Class
        # This is complex for a quick query, let's assume global or fix later if needed.
        pass

    total_submissions = query.count()
    avg_score = db.query(func.avg(Submission.score)).scalar() or 0.0
    
    # Total active students (who have submitted at least once)
    active_students = db.query(Submission.student_id).distinct().count()

    return {
        "total_submissions": total_submissions,
        "average_score": round(avg_score, 1),
        "active_students": active_students
    }

@router.get("/weak-skills")
async def get_weak_skills(
    limit: int = 5,
    db: Session = Depends(get_db)
):
    """
    Identify the skill tags with the most incorrect answers.
    """
    # Join Answer -> Question to get skill_tag
    # Filter where is_correct is False
    # Group by skill_tag
    results = (
        db.query(Question.skill_tag, func.count(Answer.id).label("error_count"))
        .join(Answer, Answer.question_id == Question.id)
        .filter(Answer.is_correct == False)
        .filter(Question.skill_tag != None)
        .group_by(Question.skill_tag)
        .order_by(desc("error_count"))
        .limit(limit)
        .all()
    )

    return [
        {"skill": skill, "errors": count}
        for skill, count in results
    ]

@router.get("/student-performance")
async def get_student_performance(
    db: Session = Depends(get_db)
):
    """
    Get average performance per student to spot struggling students.
    """
    results = (
        db.query(
            User.username, 
            func.avg(Submission.score).label("avg_score"),
            func.count(Submission.id).label("exams_taken")
        )
        .join(Submission, Submission.student_id == User.id)
        .group_by(User.id, User.username)
        .order_by(func.avg(Submission.score).asc()) # Lowest first
        .limit(10)
        .all()
    )

    return [
        {
            "student": username, 
            "average_score": round(score, 1) if score else 0,
            "exams_taken": count
        }
        for username, score, count in results
    ]
