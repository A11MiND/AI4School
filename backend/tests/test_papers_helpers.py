import pytest
from app.auth import jwt
from app.models.user import User
from app.models.class_model import ClassModel
from app.models.student_association import StudentClass
from app.models.paper import Paper
from app.models.question import Question
from app.models.assignment import Assignment
from app.models.submission import Answer
from app.routers.papers import _normalize_text, _to_list


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def seed_open_answer(db_session):
    teacher = User(username="teacher_open", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_open", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    class_ = ClassModel(name="Open Class", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    assoc = StudentClass(user_id=student.id, class_id=class_.id)
    db_session.add(assoc)
    db_session.commit()

    paper = Paper(title="Open Paper", article_content="Text", created_by=teacher.id, class_id=class_.id)
    db_session.add(paper)
    db_session.commit()

    question = Question(
        paper_id=paper.id,
        question_text="Explain",
        question_type="short",
        correct_answer="[]",
        skill_tag="Inference"
    )
    db_session.add(question)
    db_session.commit()

    assignment = Assignment(paper_id=paper.id, class_id=class_.id)
    db_session.add(assignment)
    db_session.commit()

    return teacher, student, paper, question


def test_normalize_and_to_list():
    assert _normalize_text(None) == ""
    assert _normalize_text("  First, SECOND!! ") == "1st 2nd"
    assert _to_list(None) == []
    assert _to_list(["A", 2]) == ["A", "2"]
    assert _to_list("[\"A\", \"B\"]") == ["A", "B"]
    assert _to_list("{\"answer\": \"C\"}") == ["C"]
    assert _to_list(5) == ["5"]


def test_submit_open_answer_scoring(client, db_session, monkeypatch):
    teacher, student, paper, question = seed_open_answer(db_session)

    monkeypatch.setattr("app.routers.papers.grade_open_answer", lambda **kwargs: 0.8)

    res_submit = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={"answers": [{"question_id": question.id, "answer": "Some answer"}]}
    )
    assert res_submit.status_code == 200
    assert res_submit.json()["score"] == 80.0


def test_update_answer_score_not_found(client, db_session):
    teacher = User(username="teacher_score", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    res = client.put(
        "/papers/submissions/answers/9999/score",
        headers=auth_header(teacher),
        json={"score": 3}
    )
    assert res.status_code == 404


def test_submission_detail_forbidden(client, db_session):
    teacher, student, paper, question = seed_open_answer(db_session)

    res_submit = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={"answers": [{"question_id": question.id, "answer": "Some answer"}]}
    )
    assert res_submit.status_code == 200
    submission_id = res_submit.json()["submission_id"]

    other = User(username="student_other", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add(other)
    db_session.commit()

    res_forbidden = client.get(
        f"/papers/submissions/{submission_id}",
        headers=auth_header(other)
    )
    assert res_forbidden.status_code == 403
