from app.auth import jwt
from app.models.user import User
from app.models.paper import Paper
from app.models.question import Question
from app.models.submission import Submission, Answer


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_student_report_high_avg_with_weak_skill(client, db_session):
    student = User(username="student_high", password_hash=jwt.get_password_hash("pass"), role="student")
    teacher = User(username="teacher_high", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add_all([student, teacher])
    db_session.commit()

    paper = Paper(title="High", article_content="Text", created_by=teacher.id)
    db_session.add(paper)
    db_session.commit()

    question = Question(paper_id=paper.id, question_text="Q", question_type="mcq", skill_tag="Inference")
    db_session.add(question)
    db_session.commit()

    submission = Submission(student_id=student.id, paper_id=paper.id, score=90)
    db_session.add(submission)
    db_session.commit()

    answer = Answer(submission_id=submission.id, question_id=question.id, answer="X", is_correct=False, score=0)
    db_session.add(answer)
    db_session.commit()

    res = client.get("/analytics/student-report", headers=auth_header(student))
    assert res.status_code == 200
    assert "Great work" in res.json()["summary"]
    assert "Focus next" in res.json()["summary"]


def test_student_report_mid_avg(client, db_session):
    student = User(username="student_mid", password_hash=jwt.get_password_hash("pass"), role="student")
    teacher = User(username="teacher_mid", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add_all([student, teacher])
    db_session.commit()

    paper = Paper(title="Mid", article_content="Text", created_by=teacher.id)
    db_session.add(paper)
    db_session.commit()

    submission = Submission(student_id=student.id, paper_id=paper.id, score=75)
    db_session.add(submission)
    db_session.commit()

    res = client.get("/analytics/student-report", headers=auth_header(student))
    assert res.status_code == 200
    assert "Solid progress" in res.json()["summary"]


def test_student_report_low_avg(client, db_session):
    student = User(username="student_low", password_hash=jwt.get_password_hash("pass"), role="student")
    teacher = User(username="teacher_low", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add_all([student, teacher])
    db_session.commit()

    paper = Paper(title="Low", article_content="Text", created_by=teacher.id)
    db_session.add(paper)
    db_session.commit()

    submission = Submission(student_id=student.id, paper_id=paper.id, score=60)
    db_session.add(submission)
    db_session.commit()

    res = client.get("/analytics/student-report", headers=auth_header(student))
    assert res.status_code == 200
    assert "Keep practicing" in res.json()["summary"]


def test_analytics_teacher_required(client, db_session):
    student = User(username="student_forbidden", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add(student)
    db_session.commit()

    res = client.get("/analytics/overview", headers=auth_header(student))
    assert res.status_code == 403


def test_student_report_forbidden(client, db_session):
    teacher = User(username="teacher_forbidden", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    res = client.get("/analytics/student-report", headers=auth_header(teacher))
    assert res.status_code == 403
