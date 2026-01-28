from fastapi import APIRouter, Depends, HTTPException
import json
import re
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from ..database import get_db
from ..models.paper import Paper
from ..models.question import Question
from ..models.user import User
from ..auth.jwt import get_current_user
from ..services.ai_generator import generate_dse_questions, grade_open_answer
from ..models.assignment import Assignment
from ..models.student_association import StudentClass
from ..models.submission import Submission, Answer
from ..models.student_notebook import StudentNotebook

router = APIRouter(
    prefix="/papers",
    tags=["papers"]
)

# Pydantic Models
class QuestionBase(BaseModel):
    question_text: str
    question_type: str
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None

class PaperCreate(BaseModel):
    title: str
    article_content: str
    questions: List[QuestionBase]
    class_id: Optional[int] = None

class GenerateRequest(BaseModel):
    article_content: str
    difficulty: Optional[str] = None
    assessment_objectives: Optional[List[str]] = None
    question_formats: Optional[List[str]] = None
    question_format_counts: Optional[dict] = None
    marking_strictness: Optional[str] = None
    text_type: Optional[str] = None
    register: Optional[str] = None
    cognitive_load: Optional[str] = None

class AnswerSubmit(BaseModel):
    question_id: int
    answer: str

class PaperSubmit(BaseModel):
    answers: List[AnswerSubmit]

OBJECTIVE_TYPES = {
    "mcq", "tf", "true_false", "truefalse", "matching", "gap", "cloze",
    "table", "objective"
}

OPEN_TYPES = {
    "short", "short_answer", "long", "open", "summary", "sentence_completion",
    "phrase_extraction"
}

def _normalize_text(text: Optional[str]) -> str:
    if not text:
        return ""
    normalized = text.strip().lower()
    normalized = re.sub(r"[^\w\s]", " ", normalized)

    ordinal_map = {
        "first": "1st",
        "second": "2nd",
        "third": "3rd",
        "fourth": "4th",
        "fifth": "5th",
        "sixth": "6th",
        "seventh": "7th",
        "eighth": "8th",
        "ninth": "9th",
        "tenth": "10th",
        "eleventh": "11th",
        "twelfth": "12th",
        "thirteenth": "13th",
        "fourteenth": "14th",
        "fifteenth": "15th",
        "sixteenth": "16th",
        "seventeenth": "17th",
        "eighteenth": "18th",
        "nineteenth": "19th",
        "twentieth": "20th",
        "thirtieth": "30th",
        "fortieth": "40th",
        "fiftieth": "50th",
        "sixtieth": "60th",
        "seventieth": "70th",
        "eightieth": "80th",
        "ninetieth": "90th",
        "hundredth": "100th",
    }

    for word, replacement in ordinal_map.items():
        normalized = re.sub(rf"\b{word}\b", replacement, normalized)

    return " ".join(normalized.split())

def _to_list(value: Optional[object]) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(v) for v in parsed]
            if isinstance(parsed, dict):
                answer_value = parsed.get("answer")
                if answer_value is not None:
                    return [str(answer_value)]
            return [str(parsed)]
        except Exception:
            return [value]
    return [str(value)]

@router.post("/generate")
def generate_questions(request: GenerateRequest, current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only teachers can generate papers")
    
    options = {
        "difficulty": request.difficulty,
        "assessment_objectives": request.assessment_objectives,
        "question_formats": request.question_formats,
        "question_format_counts": request.question_format_counts,
        "marking_strictness": request.marking_strictness,
        "text_type": request.text_type,
        "register": request.register,
        "cognitive_load": request.cognitive_load
    }
    questions_data = generate_dse_questions(request.article_content, options)
    return questions_data

@router.post("/")
def create_paper(paper: PaperCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only teachers can create papers")
    
    # Create Paper
    # In a full production environment, the teacher would explicitly select a class.
    # Currently, we can default to a general class or require class selection in the future.
    
    new_paper = Paper(
        title=paper.title,
        article_content=paper.article_content, 
        created_by=current_user.id,
        class_id=paper.class_id if paper.class_id else None
    ) 
    
    db.add(new_paper)
    db.commit()
    db.refresh(new_paper)

    # 2. Create Questions
    for q in paper.questions:
        new_q = Question(
            paper_id=new_paper.id,
            question_text=q.question_text,
            question_type=q.question_type,
            options=q.options,         # SQLAlchemy handles generic JSON
            correct_answer=q.correct_answer # SQLAlchemy handles generic JSON
        )
        db.add(new_q)
    
    db.commit()
    return {"message": "Paper published successfully", "paper_id": new_paper.id}

@router.get("/")
def list_papers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Students see papers assigned to them OR their classes
    if current_user.role == "student":
        # 1. Find student's classes
        student_classes = db.query(StudentClass.class_id).filter(StudentClass.user_id == current_user.id).all()
        class_ids = [sc.class_id for sc in student_classes]
        
        # 2. Find assignments matches
        query = db.query(Assignment)
        if class_ids:
             query = query.filter((Assignment.student_id == current_user.id) | (Assignment.class_id.in_(class_ids)))
        else:
             query = query.filter(Assignment.student_id == current_user.id)
             
        assignments = query.all()
        paper_ids = [a.paper_id for a in assignments]
        
        if not paper_ids:
            return []
            
        # 3. Return papers with assignment stats
        # return db.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        
        results = []
        for assign in assignments:
            paper = db.query(Paper).filter(Paper.id == assign.paper_id).first()
            if not paper: continue
            
            # Find submissions for this paper/student
            subs = db.query(Submission).filter(
                Submission.student_id == current_user.id,
                Submission.paper_id == paper.id
            ).order_by(Submission.submitted_at.desc()).all()
            
            best_score = max([s.score for s in subs if s.score is not None], default=None)
            latest_sub = subs[0] if subs else None
            
            results.append({
                "id": paper.id, 
                "title": paper.title,
                "assignment_id": assign.id,
                "deadline": assign.deadline,
                "duration_minutes": assign.duration_minutes,
                "max_attempts": assign.max_attempts,
                "submitted_count": len(subs),
                "latest_score": latest_sub.score if latest_sub else None,
                "latest_submission_id": latest_sub.id if latest_sub else None,
                "status": "completed" if latest_sub else "pending" # simplified status
            })
        return results
        
    # Teachers see papers they created
    return db.query(Paper).filter(Paper.created_by == current_user.id).all()

@router.delete("/{paper_id}")
def delete_paper(paper_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    if current_user.role != "admin" and paper.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not your paper")

    submission_rows = db.query(Submission.id).filter(Submission.paper_id == paper_id).all()
    submission_ids = [row.id for row in submission_rows]

    question_rows = db.query(Question.id).filter(Question.paper_id == paper_id).all()
    question_ids = [row.id for row in question_rows]

    if submission_ids:
        db.query(Answer).filter(Answer.submission_id.in_(submission_ids)).delete(synchronize_session=False)
        db.query(Submission).filter(Submission.id.in_(submission_ids)).delete(synchronize_session=False)

    if question_ids:
        db.query(StudentNotebook).filter(StudentNotebook.question_id.in_(question_ids)).delete(synchronize_session=False)

    db.query(StudentNotebook).filter(StudentNotebook.original_paper_id == paper_id).delete(synchronize_session=False)
    db.query(Assignment).filter(Assignment.paper_id == paper_id).delete(synchronize_session=False)
    db.query(Question).filter(Question.paper_id == paper_id).delete(synchronize_session=False)
    db.delete(paper)
    db.commit()
    return {"message": "Paper deleted"}

@router.get("/{paper_id}")
def get_paper(paper_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
         raise HTTPException(status_code=404, detail="Paper not found")
    
    # Context: Is this a student taking the paper?
    assignment_info = None
    submission_info = None
    
    # Determine if we should show student view data
    # (Allow if role is student OR if a submission exists for this user)
    
    # 1. Try to find assignment (Student/General)
    assign = db.query(Assignment).filter(Assignment.paper_id == paper_id, Assignment.student_id == current_user.id).first()
    if not assign:
         student_classes = db.query(StudentClass).filter(StudentClass.user_id == current_user.id).all()
         class_ids = [sc.class_id for sc in student_classes]
         assign = db.query(Assignment).filter(Assignment.paper_id == paper_id, Assignment.class_id.in_(class_ids)).first()
    
    if assign:
        assignment_info = {
            "deadline": assign.deadline,
            "duration_minutes": assign.duration_minutes,
            "max_attempts": assign.max_attempts
        }
    
    # 2. Check existing submission
    submissions = db.query(Submission).filter(Submission.paper_id == paper_id, Submission.student_id == current_user.id).all()
    if submissions:
        # Get latest
        last_sub = submissions[-1]
        answers = db.query(Answer).filter(Answer.submission_id == last_sub.id).all()
        submission_info = {
            "id": last_sub.id,
            "score": last_sub.score,
            "submitted_at": last_sub.submitted_at,
            "attempt_count": len(submissions),
            "answers": {a.question_id: a.answer for a in answers}
        }

    # Fetch questions
    questions = db.query(Question).filter(Question.paper_id == paper_id).all()
    
    return {
        "id": paper.id,
        "title": paper.title,
        "article_content": paper.article_content,
        "questions": questions,
        "assignment": assignment_info,
        "submission": submission_info
    }

class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None # Accepts JSON string or plain string

@router.put("/questions/{question_id}")
def update_question(question_id: int, question: QuestionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Check paper ownership
    paper = db.query(Paper).filter(Paper.id == q.paper_id).first()
    if paper.created_by != current_user.id and current_user.role != "admin":
         raise HTTPException(status_code=403, detail="Not your paper")

    if question.question_text is not None:
        q.question_text = question.question_text
    if question.question_type is not None:
        q.question_type = question.question_type
    if question.options is not None:
        q.options = question.options
    if question.correct_answer is not None:
        q.correct_answer = question.correct_answer

    db.commit()
    db.refresh(q)
    return q

@router.post("/{paper_id}/submit")
def submit_paper(paper_id: int, submit: PaperSubmit, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Calculate limits (simplified logic, ideally should re-check assignment)
    
    # Create submission
    sub = Submission(
        student_id=current_user.id,
        paper_id=paper_id
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    correct_count = 0.0
    total_q = 0

    # Save answers and calculate initial grade
    for ans in submit.answers:
        new_ans = Answer(
            submission_id=sub.id,
            question_id=ans.question_id,
            answer=ans.answer
        )
        # Check correctness
        q = db.query(Question).filter(Question.id == ans.question_id).first()
        is_correct = False
        score = 0.0
        if q:
            total_q += 1
            q_type = (q.question_type or "").strip().lower()

            if q_type in OBJECTIVE_TYPES:
                correct_values = _to_list(q.correct_answer)
                student_value = _normalize_text(ans.answer)
                normalized = [_normalize_text(v) for v in correct_values]
                if student_value and student_value in normalized:
                    is_correct = True
                    score = 1.0
                else:
                    score = 0.0
            else:
                expected = q.correct_answer if q.correct_answer is not None else q.correct_answer_schema
                score = grade_open_answer(
                    question_text=q.question_text,
                    expected_points=expected,
                    student_answer=ans.answer or "",
                    strictness="moderate"
                )
                if score >= 0.6:
                    is_correct = True

            correct_count += score

        new_ans.is_correct = is_correct
        new_ans.score = score
        db.add(new_ans)
    
    # Update total score
    if total_q > 0:
        sub.score = (correct_count / total_q) * 100
    else:
        # Maybe text only?
        sub.score = 0 
        
    db.commit()
    return {"message": "Submitted successfully", "submission_id": sub.id, "score": sub.score}

class GradeUpdate(BaseModel):
    score: float

@router.put("/submissions/answers/{answer_id}/score")
def update_answer_score(answer_id: int, grade: GradeUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    ans = db.query(Answer).filter(Answer.id == answer_id).first()
    if not ans:
        raise HTTPException(status_code=404, detail="Answer not found")
        
    ans.score = grade.score
    
    # Calculate submission total score
    sub = db.query(Submission).filter(Submission.id == ans.submission_id).first()
    
    # Calculate total score from all answer scores.
    # In a real system, we might weigh questions differently. 
    # Here we sum the individual scores.
    
    all_answers = db.query(Answer).filter(Answer.submission_id == sub.id).all()
    total = sum([(a.score or 0) for a in all_answers])
    sub.score = total
    
    db.commit()
    return {"message": "Score updated", "total_score": total}

@router.get("/students/{student_id}/submissions")
def get_student_submissions(student_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
         raise HTTPException(status_code=403, detail="Not authorized")
         
    subs = db.query(Submission).filter(Submission.student_id == student_id).all()
    result = []
    for s in subs:
        result.append({
            "id": s.id,
            "paper_title": s.paper.title,
            "submitted_at": s.submitted_at,
            "score": s.score
        })
    return result

@router.get("/submissions/{submission_id}")
def get_submission_detail(submission_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Teacher or the student themselves
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    if current_user.role == "student" and sub.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    answers = db.query(Answer).filter(Answer.submission_id == sub.id).all()
    ans_list = []
    for a in answers:
        q = db.query(Question).filter(Question.id == a.question_id).first()
        ans_list.append({
            "id": a.id,
            "question_text": q.question_text if q else "Unknown Question",
            "question_type": q.question_type if q else "unknown",
            "max_score": 10, # Default max score for display purposes
            "answer": a.answer,
            "is_correct": a.is_correct,
            "score": a.score
        })
        
    return {
        "id": sub.id,
        "student_name": sub.student.username,
        "paper_title": sub.paper.title,
        "score": sub.score,
        "answers": ans_list
    }
