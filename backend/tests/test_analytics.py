from app.auth import jwt
from app.models.user import User
from app.models.class_model import ClassModel
from app.models.student_association import StudentClass
from app.models.paper import Paper
from app.models.question import Question
from app.models.submission import Submission, Answer


def seed_analytics_data(db):
    teacher = User(username="teacher1", password_hash="x", role="teacher")
    student = User(username="student1", password_hash="x", role="student")
    db.add_all([teacher, student])
    db.commit()

    class_ = ClassModel(name="Class A", teacher_id=teacher.id)
    db.add(class_)
    db.commit()

    assoc = StudentClass(user_id=student.id, class_id=class_.id)
    db.add(assoc)
    db.commit()

    paper = Paper(title="Test Paper", article_content="Text", created_by=teacher.id, class_id=class_.id)
    db.add(paper)
    db.commit()

    q1 = Question(paper_id=paper.id, question_text="Q1", question_type="mcq", skill_tag="Inference")
    q2 = Question(paper_id=paper.id, question_text="Q2", question_type="gap", skill_tag="Vocabulary")
    db.add_all([q1, q2])
    db.commit()

    submission = Submission(student_id=student.id, paper_id=paper.id, score=64.2857142857)
    db.add(submission)
    db.commit()

    a1 = Answer(submission_id=submission.id, question_id=q1.id, answer="A", is_correct=False, score=0)
    a2 = Answer(submission_id=submission.id, question_id=q2.id, answer="word", is_correct=True, score=1)
    db.add_all([a1, a2])
    db.commit()

    return teacher, student, class_


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_teacher_weak_areas(client, db_session):
    teacher, _, class_ = seed_analytics_data(db_session)

    res = client.get(
        f"/analytics/weak-areas?class_id={class_.id}",
        headers=auth_header(teacher)
    )

    assert res.status_code == 200
    data = res.json()
    assert "skills" in data
    assert "question_types" in data
    assert "papers" in data
    assert "students" in data
    assert len(data["skills"]) > 0
    assert len(data["question_types"]) > 0
    assert len(data["papers"]) > 0
    assert len(data["students"]) > 0
    assert "weak_skills" in data["students"][0]


def test_student_report_rounding(client, db_session):
    _, student, _ = seed_analytics_data(db_session)

    res = client.get(
        "/analytics/student-report",
        headers=auth_header(student)
    )

    assert res.status_code == 200
    data = res.json()
    assert data["overview"]["latest_score"] == 64.3
    assert data["trend"][0]["score"] == 64.3
    assert data["recent"][0]["score"] == 64.3
    assert any(item["question_type"] == "mcq" for item in data["type_accuracy"])
