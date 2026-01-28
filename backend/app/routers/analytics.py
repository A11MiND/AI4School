from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case

from ..database import get_db
from ..models.submission import Submission, Answer
from ..models.question import Question
from ..models.user import User
from ..models.paper import Paper
from ..models.student_association import StudentClass
from ..auth.jwt import get_current_user

router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    responses={404: {"description": "Not found"}},
)

def _require_teacher(current_user: User):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Not authorized")

def _teacher_submission_query(db: Session, current_user: User, class_id: int = None):
    query = db.query(Submission).join(Paper, Submission.paper_id == Paper.id)
    if current_user.role != "admin":
        query = query.filter(Paper.created_by == current_user.id)
    if class_id:
        class_student_ids = db.query(StudentClass.user_id).filter(StudentClass.class_id == class_id)
        query = query.filter(Submission.student_id.in_(class_student_ids))
    return query

def _teacher_answer_query(db: Session, current_user: User, class_id: int = None):
    query = (
        db.query(Answer)
        .join(Submission, Submission.id == Answer.submission_id)
        .join(Question, Question.id == Answer.question_id)
        .join(Paper, Paper.id == Question.paper_id)
    )
    if current_user.role != "admin":
        query = query.filter(Paper.created_by == current_user.id)
    if class_id:
        class_student_ids = db.query(StudentClass.user_id).filter(StudentClass.class_id == class_id)
        query = query.filter(Submission.student_id.in_(class_student_ids))
    return query

@router.get("/overview")
async def get_analytics_overview(
    class_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get high-level statistics for the dashboard.
    """
    _require_teacher(current_user)

    query = _teacher_submission_query(db, current_user, class_id)
    total_submissions = query.count()
    avg_score = query.with_entities(func.avg(Submission.score)).scalar() or 0.0
    active_students = query.with_entities(Submission.student_id).distinct().count()

    return {
        "total_submissions": total_submissions,
        "average_score": round(avg_score, 1),
        "active_students": active_students
    }

@router.get("/weak-skills")
async def get_weak_skills(
    limit: int = 5,
    class_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Identify the skill tags with the most incorrect answers.
    """
    _require_teacher(current_user)

    results = (
        db.query(Question.skill_tag, func.count(Answer.id).label("error_count"))
        .join(Answer, Answer.question_id == Question.id)
        .join(Submission, Submission.id == Answer.submission_id)
        .join(Paper, Paper.id == Question.paper_id)
        .filter(Answer.is_correct == False)
        .filter(Question.skill_tag != None)
    )

    if current_user.role != "admin":
        results = results.filter(Paper.created_by == current_user.id)

    if class_id:
        class_student_ids = db.query(StudentClass.user_id).filter(StudentClass.class_id == class_id)
        results = results.filter(Submission.student_id.in_(class_student_ids))

    results = (
        results.group_by(Question.skill_tag)
        .order_by(desc("error_count"))
        .limit(limit)
        .all()
    )

    return [{"skill": skill, "errors": count} for skill, count in results]

@router.get("/student-performance")
async def get_student_performance(
    class_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get average performance per student to spot struggling students.
    """
    _require_teacher(current_user)

    results = (
        db.query(
            User.username,
            func.avg(Submission.score).label("avg_score"),
            func.count(Submission.id).label("exams_taken")
        )
        .join(Submission, Submission.student_id == User.id)
        .join(Paper, Submission.paper_id == Paper.id)
    )

    if current_user.role != "admin":
        results = results.filter(Paper.created_by == current_user.id)

    if class_id:
        class_student_ids = db.query(StudentClass.user_id).filter(StudentClass.class_id == class_id)
        results = results.filter(Submission.student_id.in_(class_student_ids))

    results = (
        results.group_by(User.id, User.username)
        .order_by(func.avg(Submission.score).asc())
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

@router.get("/weak-areas")
async def get_weak_areas(
    limit: int = 5,
    class_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get richer weak-area insights for teachers.
    """
    _require_teacher(current_user)

    base_answers = _teacher_answer_query(db, current_user, class_id)

    skill_rows = (
        base_answers
        .with_entities(
            Question.skill_tag,
            func.sum(case((Answer.is_correct == True, 1), else_=0)).label("correct"),
            func.count(Answer.id).label("total"),
        )
        .filter(Question.skill_tag != None)
        .group_by(Question.skill_tag)
        .all()
    )

    skills = []
    for skill, correct, total in skill_rows:
        total_val = int(total or 0)
        errors = total_val - int(correct or 0)
        accuracy = round((correct or 0) / total_val * 100, 1) if total_val else 0
        skills.append({
            "skill": skill,
            "errors": errors,
            "accuracy": accuracy,
            "total": total_val
        })
    skills = sorted(skills, key=lambda x: x["errors"], reverse=True)[:limit]

    type_rows = (
        base_answers
        .with_entities(
            Question.question_type,
            func.sum(case((Answer.is_correct == True, 1), else_=0)).label("correct"),
            func.count(Answer.id).label("total"),
        )
        .filter(Question.question_type != None)
        .group_by(Question.question_type)
        .all()
    )

    question_types = []
    for q_type, correct, total in type_rows:
        total_val = int(total or 0)
        errors = total_val - int(correct or 0)
        accuracy = round((correct or 0) / total_val * 100, 1) if total_val else 0
        question_types.append({
            "question_type": q_type,
            "errors": errors,
            "accuracy": accuracy,
            "total": total_val
        })
    question_types = sorted(question_types, key=lambda x: x["errors"], reverse=True)[:limit]

    submission_query = _teacher_submission_query(db, current_user, class_id)
    paper_rows = (
        submission_query
        .with_entities(
            Paper.id,
            Paper.title,
            func.avg(Submission.score).label("avg_score"),
            func.count(Submission.id).label("submissions"),
        )
        .group_by(Paper.id, Paper.title)
        .all()
    )

    papers = [
        {
            "paper_id": pid,
            "title": title,
            "average_score": round(avg_score, 1) if avg_score is not None else 0,
            "submissions": int(submissions or 0)
        }
        for pid, title, avg_score, submissions in paper_rows
    ]
    papers = sorted(papers, key=lambda x: x["average_score"])[:limit]

    student_rows = (
        submission_query
        .with_entities(
            User.id,
            User.username,
            func.avg(Submission.score).label("avg_score"),
            func.count(Submission.id).label("exams_taken"),
        )
        .join(User, Submission.student_id == User.id)
        .group_by(User.id, User.username)
        .all()
    )

    students = [
        {
            "student_id": sid,
            "student": username,
            "average_score": round(avg_score, 1) if avg_score is not None else 0,
            "exams_taken": int(exams_taken or 0)
        }
        for sid, username, avg_score, exams_taken in student_rows
    ]
    students = sorted(students, key=lambda x: x["average_score"])[:limit]

    student_ids = [student["student_id"] for student in students]
    weak_skills_by_student = {}
    if student_ids:
        student_skill_rows = (
            base_answers
            .with_entities(
                Submission.student_id,
                Question.skill_tag,
                func.sum(case((Answer.is_correct == True, 1), else_=0)).label("correct"),
                func.count(Answer.id).label("total"),
            )
            .filter(Submission.student_id.in_(student_ids))
            .filter(Question.skill_tag != None)
            .group_by(Submission.student_id, Question.skill_tag)
            .all()
        )

        for student_id, skill, correct, total in student_skill_rows:
            total_val = int(total or 0)
            errors = total_val - int(correct or 0)
            accuracy = round((correct or 0) / total_val * 100, 1) if total_val else 0
            weak_skills_by_student.setdefault(student_id, []).append({
                "skill": skill,
                "errors": errors,
                "accuracy": accuracy,
                "total": total_val
            })

        for student_id, skills_list in weak_skills_by_student.items():
            weak_skills_by_student[student_id] = sorted(
                skills_list,
                key=lambda x: x["errors"],
                reverse=True
            )[:3]

    for student in students:
        student["weak_skills"] = weak_skills_by_student.get(student["student_id"], [])

    return {
        "skills": skills,
        "question_types": question_types,
        "papers": papers,
        "students": students
    }

@router.get("/student-report")
async def get_student_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Not authorized")

    submissions = (
        db.query(Submission)
        .filter(Submission.student_id == current_user.id)
        .order_by(Submission.submitted_at.desc())
        .all()
    )

    total_submissions = len(submissions)
    avg_score = (
        db.query(func.avg(Submission.score))
        .filter(Submission.student_id == current_user.id)
        .scalar()
        or 0.0
    )

    recent = (
        db.query(Submission, Paper)
        .join(Paper, Submission.paper_id == Paper.id)
        .filter(Submission.student_id == current_user.id)
        .order_by(Submission.submitted_at.desc())
        .limit(5)
        .all()
    )

    trend = [
        {
            "paper_id": paper.id,
            "paper_title": paper.title,
            "score": round(sub.score, 1) if sub.score is not None else None,
            "submitted_at": sub.submitted_at
        }
        for sub, paper in reversed(recent)
    ]

    weak_skills = (
        db.query(Question.skill_tag, func.count(Answer.id).label("error_count"))
        .join(Answer, Answer.question_id == Question.id)
        .join(Submission, Submission.id == Answer.submission_id)
        .filter(Submission.student_id == current_user.id)
        .filter(Answer.is_correct == False)
        .filter(Question.skill_tag != None)
        .group_by(Question.skill_tag)
        .order_by(desc("error_count"))
        .limit(5)
        .all()
    )

    accuracy_rows = (
        db.query(
            Question.skill_tag,
            func.sum(case((Answer.is_correct == True, 1), else_=0)).label("correct"),
            func.count(Answer.id).label("total"),
        )
        .join(Answer, Answer.question_id == Question.id)
        .join(Submission, Submission.id == Answer.submission_id)
        .filter(Submission.student_id == current_user.id)
        .filter(Question.skill_tag != None)
        .group_by(Question.skill_tag)
        .all()
    )

    skill_accuracy = []
    for skill, correct, total in accuracy_rows:
        accuracy = round((correct or 0) / total * 100, 1) if total else 0
        skill_accuracy.append({"skill": skill, "accuracy": accuracy})

    type_rows = (
        db.query(
            Question.question_type,
            func.sum(case((Answer.is_correct == True, 1), else_=0)).label("correct"),
            func.count(Answer.id).label("total"),
        )
        .join(Answer, Answer.question_id == Question.id)
        .join(Submission, Submission.id == Answer.submission_id)
        .filter(Submission.student_id == current_user.id)
        .filter(Question.question_type != None)
        .group_by(Question.question_type)
        .all()
    )

    type_accuracy = []
    for q_type, correct, total in type_rows:
        accuracy = round((correct or 0) / total * 100, 1) if total else 0
        type_accuracy.append({
            "question_type": q_type,
            "accuracy": accuracy,
            "total": int(total or 0)
        })

    weak_skill_names = [skill for skill, _ in weak_skills]
    summary_parts = []
    if total_submissions == 0:
        summary_parts.append("No submissions yet. Complete a paper to see your progress.")
    else:
        if avg_score >= 85:
            summary_parts.append("Great work so far with strong overall accuracy.")
        elif avg_score >= 70:
            summary_parts.append("Solid progress with room to refine key skills.")
        else:
            summary_parts.append("Keep practicing—focus on core comprehension and accuracy.")
        if weak_skill_names:
            summary_parts.append(f"Focus next on: {', '.join(weak_skill_names[:2])}.")

    return {
        "overview": {
            "average_score": round(avg_score, 1),
            "total_submissions": total_submissions,
            "latest_score": round(submissions[0].score, 1) if submissions and submissions[0].score is not None else None
        },
        "trend": trend,
        "weak_skills": [{"skill": skill, "errors": count} for skill, count in weak_skills],
        "skill_accuracy": skill_accuracy,
        "type_accuracy": type_accuracy,
        "recent": [
            {
                "id": sub.id,
                "paper_title": paper.title,
                "score": round(sub.score, 1) if sub.score is not None else None,
                "submitted_at": sub.submitted_at
            }
            for sub, paper in recent
        ],
        "summary": " ".join(summary_parts)
    }
