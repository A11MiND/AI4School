from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case, or_
from datetime import datetime, timezone
import csv
import io
from typing import Dict

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

def _normalize_paper_type(paper_type: str | None) -> str | None:
    if not paper_type:
        return None
    normalized = paper_type.strip().lower()
    if normalized in {"", "all"}:
        return None
    return normalized


def _teacher_submission_query(
    db: Session,
    current_user: User,
    class_id: int = None,
    paper_type: str | None = None,
    paper_id: int | None = None,
    student_id: int | None = None,
):
    query = db.query(Submission).join(Paper, Submission.paper_id == Paper.id)
    return _apply_teacher_filters(
        query,
        db,
        current_user,
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
    )


def _teacher_answer_query(
    db: Session,
    current_user: User,
    class_id: int = None,
    paper_type: str | None = None,
    paper_id: int | None = None,
    student_id: int | None = None,
):
    query = (
        db.query(Answer)
        .join(Submission, Submission.id == Answer.submission_id)
        .join(Question, Question.id == Answer.question_id)
        .join(Paper, Paper.id == Question.paper_id)
    )
    return _apply_teacher_filters(
        query,
        db,
        current_user,
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
    )


def _apply_teacher_filters(
    query,
    db: Session,
    current_user: User,
    class_id: int | None = None,
    paper_type: str | None = None,
    paper_id: int | None = None,
    student_id: int | None = None,
):
    if current_user.role != "admin":
        query = query.filter(Paper.created_by == current_user.id)
    if class_id:
        class_student_ids = db.query(StudentClass.user_id).filter(StudentClass.class_id == class_id)
        query = query.filter(Submission.student_id.in_(class_student_ids))
    normalized_type = _normalize_paper_type(paper_type)
    if normalized_type:
        query = query.filter(func.coalesce(Paper.paper_type, "reading") == normalized_type)
    if paper_id is not None:
        query = query.filter(Paper.id == paper_id)
    if student_id is not None:
        query = query.filter(Submission.student_id == student_id)
    return query


def _csv_write_section(writer: csv.writer, title: str, headers: list[str], rows: list[list[object]]):
    writer.writerow([title])
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    writer.writerow([])


def _build_analytics_csv_payload(
    overview: dict,
    weak_skills: list[dict],
    student_performance: list[dict],
    weak_areas: dict,
    class_id: int | None,
    paper_type: str | None,
    paper_id: int | None,
    student_id: int | None,
) -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    generated_at = datetime.now(timezone.utc).isoformat()
    writer.writerow(["AI4School Analytics Export"])
    writer.writerow(["Generated At (UTC)", generated_at])
    writer.writerow(["Class Filter", str(class_id) if class_id is not None else "all"])
    writer.writerow(["Subject Filter", paper_type if paper_type else "all"])
    writer.writerow(["Paper Filter", str(paper_id) if paper_id is not None else "all"])
    writer.writerow(["Student Filter", str(student_id) if student_id is not None else "all"])
    writer.writerow([])

    _csv_write_section(
        writer,
        "Overview",
        ["average_score", "total_submissions", "active_students"],
        [[
            overview.get("average_score", 0),
            overview.get("total_submissions", 0),
            overview.get("active_students", 0),
        ]],
    )

    _csv_write_section(
        writer,
        "Weak Skills",
        ["skill", "errors"],
        [[item.get("skill", ""), item.get("errors", 0)] for item in weak_skills],
    )

    _csv_write_section(
        writer,
        "Student Performance",
        ["student", "average_score", "exams_taken"],
        [[item.get("student", ""), item.get("average_score", 0), item.get("exams_taken", 0)] for item in student_performance],
    )

    _csv_write_section(
        writer,
        "Weak Question Types",
        ["question_type", "errors", "accuracy", "total"],
        [[item.get("question_type", ""), item.get("errors", 0), item.get("accuracy", 0), item.get("total", 0)] for item in weak_areas.get("question_types", [])],
    )

    _csv_write_section(
        writer,
        "Lowest Performing Papers",
        ["paper_id", "title", "average_score", "submissions"],
        [[item.get("paper_id", ""), item.get("title", ""), item.get("average_score", 0), item.get("submissions", 0)] for item in weak_areas.get("papers", [])],
    )

    student_weak_skill_rows: list[list[object]] = []
    for student in weak_areas.get("students", []):
        weak_skill_labels = ", ".join([
            f"{w.get('skill', '')} ({w.get('errors', 0)})"
            for w in (student.get("weak_skills", []) or [])
        ])
        student_weak_skill_rows.append([
            student.get("student", ""),
            student.get("average_score", 0),
            student.get("exams_taken", 0),
            weak_skill_labels,
        ])
    _csv_write_section(
        writer,
        "Students Needing Attention",
        ["student", "average_score", "exams_taken", "top_weak_skills"],
        student_weak_skill_rows,
    )

    return output.getvalue()


def _build_simple_text_pdf(lines: list[str]) -> bytes:
    def _pdf_escape(text: str) -> str:
        safe = (text or "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        return safe.encode("latin-1", "replace").decode("latin-1")

    page_width = 595
    page_height = 842
    lines_per_page = 48
    chunks = [lines[i:i + lines_per_page] for i in range(0, len(lines), lines_per_page)] or [[]]

    objects: list[bytes] = []
    page_obj_ids: list[int] = []
    first_obj_id = 3
    for i, chunk in enumerate(chunks):
        page_obj_id = first_obj_id + i * 2
        content_obj_id = page_obj_id + 1
        page_obj_ids.append(page_obj_id)

        commands = ["BT", "/F1 11 Tf", "50 800 Td"]
        if not chunk:
            commands.append("(No data) Tj")
        else:
            commands.append(f"({_pdf_escape(chunk[0])}) Tj")
            for line in chunk[1:]:
                commands.append("0 -15 Td")
                commands.append(f"({_pdf_escape(line)}) Tj")
        commands.append("ET")
        stream_text = "\n".join(commands).encode("latin-1", "replace")

        objects.append(
            f"{content_obj_id} 0 obj\n<< /Length {len(stream_text)} >>\nstream\n".encode("latin-1")
            + stream_text
            + b"\nendstream\nendobj\n"
        )
        objects.append(
            (
                f"{page_obj_id} 0 obj\n"
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] "
                f"/Resources << /Font << /F1 {first_obj_id + len(chunks) * 2} 0 R >> >> "
                f"/Contents {content_obj_id} 0 R >>\nendobj\n"
            ).encode("latin-1")
        )

    kids = " ".join([f"{obj_id} 0 R" for obj_id in page_obj_ids])
    header_objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        f"2 0 obj\n<< /Type /Pages /Kids [{kids}] /Count {len(page_obj_ids)} >>\nendobj\n".encode("latin-1"),
    ]
    font_obj = f"{first_obj_id + len(chunks) * 2} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n".encode("latin-1")

    full_objects = header_objects + objects + [font_obj]
    content = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in full_objects:
        offsets.append(len(content))
        content.extend(obj)

    xref_start = len(content)
    content.extend(f"xref\n0 {len(full_objects) + 1}\n".encode("latin-1"))
    content.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        content.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
    content.extend(
        (
            f"trailer\n<< /Size {len(full_objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF"
        ).encode("latin-1")
    )
    return bytes(content)

@router.get("/overview")
async def get_analytics_overview(
    class_id: int = None,
    paper_type: str | None = None,
    paper_id: int | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get high-level statistics for the dashboard.
    """
    _require_teacher(current_user)

    query = _teacher_submission_query(
        db,
        current_user,
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
    )
    total_submissions = query.count()
    avg_score = query.with_entities(func.avg(Submission.score)).scalar() or 0.0
    active_students = query.with_entities(Submission.student_id).distinct().count()

    return {
        "total_submissions": total_submissions,
        "average_score": round(avg_score, 1),
        "active_students": active_students
    }


@router.get("/subject-breakdown")
async def get_subject_breakdown(
    class_id: int = None,
    paper_type: str | None = None,
    paper_id: int | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_teacher(current_user)
    objective_types = {"reading", "listening"}
    productive_types = {"writing", "speaking"}
    paper_type_expr = func.coalesce(Paper.paper_type, "reading")
    objective_filter = or_(
        Paper.paper_type.in_(tuple(objective_types)),
        Paper.paper_type.is_(None),
    )
    productive_filter = Paper.paper_type.in_(tuple(productive_types))

    objective_rows = (
        _teacher_answer_query(
            db,
            current_user,
            class_id=class_id,
            paper_type=paper_type,
            paper_id=paper_id,
            student_id=student_id,
        )
        .with_entities(
            paper_type_expr.label("paper_type"),
            Question.question_type.label("question_type"),
            func.sum(case((Answer.is_correct == True, 1), else_=0)).label("correct"),
            func.count(Answer.id).label("total"),
        )
        .filter(objective_filter)
        .group_by("paper_type", Question.question_type)
        .all()
    )

    by_question_type = []
    overall_correct = 0
    overall_total = 0
    reading_correct = 0
    reading_total = 0
    listening_correct = 0
    listening_total = 0

    for row in objective_rows:
        paper_type = str(getattr(row, "paper_type", "") or "reading")
        question_type = str(getattr(row, "question_type", "") or "unknown")
        correct = int(getattr(row, "correct", 0) or 0)
        total = int(getattr(row, "total", 0) or 0)
        accuracy = round((correct / total) * 100, 1) if total else 0.0
        by_question_type.append({
            "paper_type": paper_type,
            "question_type": question_type,
            "accuracy": accuracy,
            "correct": correct,
            "total": total,
        })
        overall_correct += correct
        overall_total += total
        if paper_type == "reading":
            reading_correct += correct
            reading_total += total
        elif paper_type == "listening":
            listening_correct += correct
            listening_total += total

    productive_by_type = []
    productive_score_weighted_sum = 0.0
    productive_score_weighted_count = 0
    productive_base_query = _teacher_submission_query(
        db,
        current_user,
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
    ).with_entities(
        Paper.id.label("paper_id"),
        paper_type_expr.label("paper_type"),
        Submission.score.label("score"),
    )
    productive_submission_rows = productive_base_query.filter(productive_filter).all()
    productive_aggregates: Dict[str, Dict[str, float | int]] = {}
    for row in productive_submission_rows:
        p_type = str(getattr(row, "paper_type", "") or "writing")
        score = getattr(row, "score", None)
        bucket = productive_aggregates.setdefault(p_type, {"sum_score": 0.0, "score_count": 0, "submissions": 0})
        bucket["submissions"] = int(bucket["submissions"]) + 1
        if isinstance(score, (int, float)):
            bucket["sum_score"] = float(bucket["sum_score"]) + float(score)
            bucket["score_count"] = int(bucket["score_count"]) + 1

    for p_type, agg in productive_aggregates.items():
        score_count = int(agg["score_count"])
        submissions = int(agg["submissions"])
        avg_score = (float(agg["sum_score"]) / score_count) if score_count else 0.0
        productive_by_type.append({
            "paper_type": p_type,
            "average_score": round(avg_score, 1),
            "submissions": submissions,
        })
        productive_score_weighted_sum += float(agg["sum_score"])
        productive_score_weighted_count += score_count

    answer_rows = (
        _teacher_answer_query(
            db,
            current_user,
            class_id=class_id,
            paper_type=paper_type,
            paper_id=paper_id,
            student_id=student_id,
        )
        .with_entities(
            Answer.rubric_scores,
            Answer.writing_metrics,
            paper_type_expr.label("paper_type"),
        )
        .filter(productive_filter)
        .all()
    )

    rubric_keys = ["content", "language", "organization", "overall"]
    rubric_totals: Dict[str, float] = {k: 0.0 for k in rubric_keys}
    rubric_counts: Dict[str, int] = {k: 0 for k in rubric_keys}
    metric_keys = [
        "LD", "TTR", "MSTTR",
        "MLS", "MLT", "C/S",
        "Temporal_token_density", "Expansion_token_density", "Comparison_token_density",
    ]
    metric_totals: Dict[str, float] = {k: 0.0 for k in metric_keys}
    metric_counts: Dict[str, int] = {k: 0 for k in metric_keys}

    for row in answer_rows:
        rubric = getattr(row, "rubric_scores", None)
        if isinstance(rubric, dict):
            for key in rubric_keys:
                value = rubric.get(key)
                if isinstance(value, (int, float)):
                    rubric_totals[key] += float(value)
                    rubric_counts[key] += 1

        metrics = getattr(row, "writing_metrics", None)
        if isinstance(metrics, dict):
            for key in metric_keys:
                value = metrics.get(key)
                if isinstance(value, (int, float)):
                    metric_totals[key] += float(value)
                    metric_counts[key] += 1

    rubric_averages = {
        key: round((rubric_totals[key] / rubric_counts[key]), 3) if rubric_counts[key] else 0.0
        for key in rubric_keys
    }
    metric_averages = [
        {
            "key": key,
            "value": round((metric_totals[key] / metric_counts[key]), 4) if metric_counts[key] else 0.0,
        }
        for key in metric_keys
    ]

    return {
        "objective": {
            "overall_accuracy": round((overall_correct / overall_total) * 100, 1) if overall_total else 0.0,
            "reading_accuracy": round((reading_correct / reading_total) * 100, 1) if reading_total else 0.0,
            "listening_accuracy": round((listening_correct / listening_total) * 100, 1) if listening_total else 0.0,
            "by_question_type": sorted(by_question_type, key=lambda x: (x["paper_type"], x["question_type"])),
        },
        "productive": {
            "overall_average_score": round((productive_score_weighted_sum / productive_score_weighted_count), 1) if productive_score_weighted_count else 0.0,
            "by_paper_type": sorted(productive_by_type, key=lambda x: x["paper_type"]),
            "rubric": rubric_averages,
            "metrics": metric_averages,
        },
    }

@router.get("/weak-skills")
async def get_weak_skills(
    limit: int = 5,
    class_id: int = None,
    paper_type: str | None = None,
    paper_id: int | None = None,
    student_id: int | None = None,
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

    results = _apply_teacher_filters(
        results,
        db,
        current_user,
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
    )

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
    paper_type: str | None = None,
    paper_id: int | None = None,
    student_id: int | None = None,
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

    results = _apply_teacher_filters(
        results,
        db,
        current_user,
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
    )

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
    paper_type: str | None = None,
    paper_id: int | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get richer weak-area insights for teachers.
    """
    _require_teacher(current_user)

    base_answers = _teacher_answer_query(
        db,
        current_user,
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
    )

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

    submission_query = _teacher_submission_query(
        db,
        current_user,
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
    )
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


@router.get("/filter-options")
async def get_analytics_filter_options(
    class_id: int = None,
    paper_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_teacher(current_user)
    base_submission_query = _teacher_submission_query(
        db,
        current_user,
        class_id=class_id,
        paper_type=paper_type,
    )

    paper_rows = (
        base_submission_query
        .with_entities(
            Paper.id,
            Paper.title,
            func.coalesce(Paper.paper_type, "reading").label("paper_type"),
        )
        .group_by(Paper.id, Paper.title, "paper_type")
        .order_by(Paper.id.desc())
        .all()
    )
    student_rows = (
        base_submission_query
        .with_entities(User.id, User.username)
        .join(User, User.id == Submission.student_id)
        .group_by(User.id, User.username)
        .order_by(User.username.asc())
        .all()
    )
    return {
        "subjects": ["reading", "listening", "writing", "speaking"],
        "papers": [{"id": pid, "title": title, "paper_type": p_type} for pid, title, p_type in paper_rows],
        "students": [{"id": sid, "username": username} for sid, username in student_rows],
    }


@router.get("/export.csv")
async def export_analytics_csv(
    limit: int = 10,
    class_id: int = None,
    paper_type: str | None = None,
    paper_id: int | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_teacher(current_user)
    overview = await get_analytics_overview(
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
        db=db,
        current_user=current_user,
    )
    weak_skills = await get_weak_skills(
        limit=limit,
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
        db=db,
        current_user=current_user,
    )
    student_performance = await get_student_performance(
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
        db=db,
        current_user=current_user,
    )
    weak_areas = await get_weak_areas(
        limit=limit,
        class_id=class_id,
        paper_type=paper_type,
        paper_id=paper_id,
        student_id=student_id,
        db=db,
        current_user=current_user,
    )

    csv_payload = _build_analytics_csv_payload(
        overview=overview,
        weak_skills=weak_skills,
        student_performance=student_performance,
        weak_areas=weak_areas,
        class_id=class_id,
        paper_type=_normalize_paper_type(paper_type),
        paper_id=paper_id,
        student_id=student_id,
    )
    filename = f"analytics_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_payload.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export.pdf")
async def export_analytics_pdf(
    limit: int = 10,
    class_id: int = None,
    paper_type: str | None = None,
    paper_id: int | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_teacher(current_user)
    normalized_type = _normalize_paper_type(paper_type)
    overview = await get_analytics_overview(
        class_id=class_id,
        paper_type=normalized_type,
        paper_id=paper_id,
        student_id=student_id,
        db=db,
        current_user=current_user,
    )
    weak_skills = await get_weak_skills(
        limit=limit,
        class_id=class_id,
        paper_type=normalized_type,
        paper_id=paper_id,
        student_id=student_id,
        db=db,
        current_user=current_user,
    )
    student_performance = await get_student_performance(
        class_id=class_id,
        paper_type=normalized_type,
        paper_id=paper_id,
        student_id=student_id,
        db=db,
        current_user=current_user,
    )
    weak_areas = await get_weak_areas(
        limit=limit,
        class_id=class_id,
        paper_type=normalized_type,
        paper_id=paper_id,
        student_id=student_id,
        db=db,
        current_user=current_user,
    )

    lines = [
        "AI4School Analytics Export",
        f"Generated At (UTC): {datetime.now(timezone.utc).isoformat()}",
        f"Class Filter: {class_id if class_id is not None else 'all'}",
        f"Subject Filter: {normalized_type if normalized_type else 'all'}",
        f"Paper Filter: {paper_id if paper_id is not None else 'all'}",
        f"Student Filter: {student_id if student_id is not None else 'all'}",
        "",
        "Overview",
        f"- Average Score: {overview.get('average_score', 0)}",
        f"- Total Submissions: {overview.get('total_submissions', 0)}",
        f"- Active Students: {overview.get('active_students', 0)}",
        "",
        "Weak Skills",
    ]
    lines.extend([
        f"- {item.get('skill', 'Unknown')}: {item.get('errors', 0)} errors"
        for item in weak_skills
    ] or ["- No data"])

    lines.append("")
    lines.append("Student Performance")
    lines.extend([
        f"- {item.get('student', 'Unknown')}: avg={item.get('average_score', 0)}, exams={item.get('exams_taken', 0)}"
        for item in student_performance
    ] or ["- No data"])

    lines.append("")
    lines.append("Weak Question Types")
    lines.extend([
        f"- {item.get('question_type', 'Unknown')}: errors={item.get('errors', 0)}, accuracy={item.get('accuracy', 0)}%"
        for item in weak_areas.get("question_types", [])
    ] or ["- No data"])

    lines.append("")
    lines.append("Lowest Performing Papers")
    lines.extend([
        f"- {item.get('title', 'Unknown')} (id={item.get('paper_id', '')}): avg={item.get('average_score', 0)}, submissions={item.get('submissions', 0)}"
        for item in weak_areas.get("papers", [])
    ] or ["- No data"])

    lines.append("")
    lines.append("Students Needing Attention")
    for item in weak_areas.get("students", []):
        weak_skill_labels = ", ".join([
            f"{w.get('skill', '')}({w.get('errors', 0)})"
            for w in (item.get("weak_skills", []) or [])
        ]) or "none"
        lines.append(
            f"- {item.get('student', 'Unknown')}: avg={item.get('average_score', 0)}, exams={item.get('exams_taken', 0)}, weak={weak_skill_labels}"
        )
    if not weak_areas.get("students"):
        lines.append("- No data")

    pdf_bytes = _build_simple_text_pdf(lines)
    filename = f"analytics_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

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
