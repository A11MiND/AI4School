from app.auth import jwt
from app.models.user import User
from app.models.paper import Paper
from app.models.question import Question
from app.models.class_model import ClassModel
from app.models.student_association import StudentClass
from app.models.assignment import Assignment
from app.models.submission import Submission


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def seed_paper_with_questions(db_session):
    teacher = User(username="teacher_paper", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_paper", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    class_ = ClassModel(name="Class Paper", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    assoc = StudentClass(user_id=student.id, class_id=class_.id)
    db_session.add(assoc)
    db_session.commit()

    paper = Paper(title="Paper One", article_content="Text", created_by=teacher.id, class_id=class_.id)
    db_session.add(paper)
    db_session.commit()

    q1 = Question(paper_id=paper.id, question_text="Q1", question_type="mcq", options=["A", "B"], correct_answer="A")
    q2 = Question(paper_id=paper.id, question_text="Q2", question_type="gap", correct_answer="word")
    db_session.add_all([q1, q2])
    db_session.commit()

    assignment = Assignment(paper_id=paper.id, class_id=class_.id)
    db_session.add(assignment)
    db_session.commit()

    return teacher, student, paper, q1, q2


def test_teacher_list_papers(client, db_session):
    teacher, _, paper, _, _ = seed_paper_with_questions(db_session)
    res = client.get("/papers", headers=auth_header(teacher))
    assert res.status_code == 200
    assert any(item["id"] == paper.id for item in res.json())


def test_student_list_and_submit(client, db_session):
    _, student, paper, q1, q2 = seed_paper_with_questions(db_session)

    res_list = client.get("/papers", headers=auth_header(student))
    assert res_list.status_code == 200
    assert len(res_list.json()) == 1

    res_submit = client.post(f"/papers/{paper.id}/submit", headers=auth_header(student), json={
        "answers": [
            {"question_id": q1.id, "answer": "A"},
            {"question_id": q2.id, "answer": "word"}
        ]
    })
    assert res_submit.status_code == 200
    assert res_submit.json()["score"] == 100.0


def test_delete_paper_cascade(client, db_session):
    teacher, student, paper, q1, _ = seed_paper_with_questions(db_session)

    res_submit = client.post(f"/papers/{paper.id}/submit", headers=auth_header(student), json={
        "answers": [{"question_id": q1.id, "answer": "A"}]
    })
    assert res_submit.status_code == 200

    res_delete = client.delete(f"/papers/{paper.id}", headers=auth_header(teacher))
    assert res_delete.status_code == 200
