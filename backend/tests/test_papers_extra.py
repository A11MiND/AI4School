from app.auth import jwt
from datetime import datetime, timedelta, timezone
from app.models.user import User
from app.models.class_model import ClassModel
from app.models.student_association import StudentClass
from app.models.paper import Paper
from app.models.question import Question
from app.models.assignment import Assignment
from app.models.submission import Submission, Answer


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def seed_teacher_student_class(db_session):
    teacher = User(username="teacher_extra", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_extra", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    class_ = ClassModel(name="Class Extra", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    assoc = StudentClass(user_id=student.id, class_id=class_.id)
    db_session.add(assoc)
    db_session.commit()

    return teacher, student, class_


def seed_paper_with_assignment(db_session, teacher, student, class_):
    paper = Paper(title="Extra Paper", article_content="Text", created_by=teacher.id, class_id=class_.id)
    db_session.add(paper)
    db_session.commit()

    question = Question(
        paper_id=paper.id,
        question_text="Q1",
        question_type="mcq",
        options=["A", "B"],
        correct_answer="A",
        skill_tag="Inference"
    )
    db_session.add(question)
    db_session.commit()

    assignment = Assignment(paper_id=paper.id, class_id=class_.id)
    db_session.add(assignment)
    db_session.commit()

    return paper, question


def test_generate_questions_teacher(client, db_session, monkeypatch):
    teacher = User(username="teacher_gen", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    def fake_generate(text, options):
        return {"questions": [{"question_text": "Q", "question_type": "mcq"}]}

    monkeypatch.setattr("app.routers.papers.generate_dse_questions", fake_generate)

    res = client.post(
        "/papers/generate",
        headers=auth_header(teacher),
        json={"article_content": "Text"}
    )
    assert res.status_code == 200
    assert res.json()["questions"][0]["question_text"] == "Q"


def test_create_and_get_paper(client, db_session):
    teacher, student, class_ = seed_teacher_student_class(db_session)

    res_create = client.post(
        "/papers",
        headers=auth_header(teacher),
        json={
            "title": "API Paper",
            "article_content": "Text",
            "class_id": class_.id,
            "questions": [
                {"question_text": "Q1", "question_type": "mcq", "options": ["A", "B"], "correct_answer": "A"}
            ]
        }
    )
    assert res_create.status_code == 200

    paper_id = res_create.json()["paper_id"]

    res_get = client.get(f"/papers/{paper_id}", headers=auth_header(student))
    assert res_get.status_code == 200
    data = res_get.json()
    assert data["id"] == paper_id
    assert len(data["questions"]) == 1


def test_update_question(client, db_session):
    teacher, student, class_ = seed_teacher_student_class(db_session)
    paper, question = seed_paper_with_assignment(db_session, teacher, student, class_)

    res_update = client.put(
        f"/papers/questions/{question.id}",
        headers=auth_header(teacher),
        json={"question_text": "Q1 updated"}
    )
    assert res_update.status_code == 200
    assert res_update.json()["question_text"] == "Q1 updated"


def test_update_answer_score_and_submission_views(client, db_session):
    teacher, student, class_ = seed_teacher_student_class(db_session)
    paper, question = seed_paper_with_assignment(db_session, teacher, student, class_)

    res_submit = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={"answers": [{"question_id": question.id, "answer": "A"}]}
    )
    assert res_submit.status_code == 200
    submission_id = res_submit.json()["submission_id"]

    answer = db_session.query(Answer).filter(Answer.submission_id == submission_id).first()
    assert answer is not None

    res_score = client.put(
        f"/papers/submissions/answers/{answer.id}/score",
        headers=auth_header(teacher),
        json={"score": 5}
    )
    assert res_score.status_code == 200
    assert res_score.json()["total_score"] == 50.0

    res_student_subs = client.get(
        f"/papers/students/{student.id}/submissions",
        headers=auth_header(teacher)
    )
    assert res_student_subs.status_code == 200
    assert any(item["id"] == submission_id for item in res_student_subs.json())

    res_detail = client.get(
        f"/papers/submissions/{submission_id}",
        headers=auth_header(student)
    )
    assert res_detail.status_code == 200
    assert res_detail.json()["id"] == submission_id


def test_teacher_cannot_grade_other_teacher_submission(client, db_session):
    teacher, student, class_ = seed_teacher_student_class(db_session)
    paper, question = seed_paper_with_assignment(db_session, teacher, student, class_)

    submit_res = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={"answers": [{"question_id": question.id, "answer": "A"}]},
    )
    assert submit_res.status_code == 200

    answer = db_session.query(Answer).filter(Answer.question_id == question.id).first()
    assert answer is not None

    other_teacher = User(username="teacher_other_owner", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(other_teacher)
    db_session.commit()

    forbidden = client.put(
        f"/papers/submissions/answers/{answer.id}/score",
        headers=auth_header(other_teacher),
        json={"score": 8},
    )
    assert forbidden.status_code == 403


def test_teacher_cannot_view_other_teacher_submission(client, db_session):
    teacher, student, class_ = seed_teacher_student_class(db_session)
    paper, question = seed_paper_with_assignment(db_session, teacher, student, class_)

    submit_res = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={"answers": [{"question_id": question.id, "answer": "A"}]},
    )
    assert submit_res.status_code == 200
    submission_id = submit_res.json()["submission_id"]

    other_teacher = User(username="teacher_not_owner", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(other_teacher)
    db_session.commit()

    forbidden = client.get(f"/papers/submissions/{submission_id}", headers=auth_header(other_teacher))
    assert forbidden.status_code == 403


def test_submit_blocks_after_deadline(client, db_session):
    teacher, student, class_ = seed_teacher_student_class(db_session)
    paper, question = seed_paper_with_assignment(db_session, teacher, student, class_)
    assignment = db_session.query(Assignment).filter(Assignment.paper_id == paper.id).first()
    assignment.deadline = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    res = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={
            "assignment_id": assignment.id,
            "answers": [{"question_id": question.id, "answer": "A"}],
        },
    )
    assert res.status_code == 400
    assert "deadline" in res.json()["detail"].lower()


def test_submit_blocks_after_max_attempts(client, db_session):
    teacher, student, class_ = seed_teacher_student_class(db_session)
    paper, question = seed_paper_with_assignment(db_session, teacher, student, class_)
    assignment = db_session.query(Assignment).filter(Assignment.paper_id == paper.id).first()
    assignment.max_attempts = 1
    db_session.commit()

    first = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={
            "assignment_id": assignment.id,
            "answers": [{"question_id": question.id, "answer": "A"}],
        },
    )
    assert first.status_code == 200

    second = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={
            "assignment_id": assignment.id,
            "answers": [{"question_id": question.id, "answer": "A"}],
        },
    )
    assert second.status_code == 400
    assert "attempt" in second.json()["detail"].lower()


def test_submit_rejects_assignment_not_targeted_to_student(client, db_session):
    teacher = User(username="teacher_target", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_target", password_hash=jwt.get_password_hash("pass"), role="student")
    other_student = User(username="student_not_target", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student, other_student])
    db_session.commit()

    paper = Paper(title="Targeted Paper", article_content="Text", created_by=teacher.id)
    db_session.add(paper)
    db_session.commit()

    question = Question(paper_id=paper.id, question_text="Q1", question_type="mcq", options=["A", "B"], correct_answer="A")
    db_session.add(question)
    db_session.commit()

    assignment = Assignment(paper_id=paper.id, student_id=other_student.id)
    db_session.add(assignment)
    db_session.commit()

    res = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={
            "assignment_id": assignment.id,
            "answers": [{"question_id": question.id, "answer": "A"}],
        },
    )
    assert res.status_code == 403


def test_writing_submit_blocks_deadline_and_max_attempts(client, db_session, monkeypatch):
    teacher, student, class_ = seed_teacher_student_class(db_session)

    writing_paper = Paper(title="Writing", article_content=None, created_by=teacher.id, class_id=class_.id, paper_type="writing")
    db_session.add(writing_paper)
    db_session.commit()

    writing_question = Question(
        paper_id=writing_paper.id,
        question_text="Write about your school life",
        question_type="writing_task1",
        writing_task_type="task1",
    )
    db_session.add(writing_question)
    db_session.commit()

    assignment = Assignment(
        paper_id=writing_paper.id,
        class_id=class_.id,
        max_attempts=1,
        deadline=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db_session.add(assignment)
    db_session.commit()

    monkeypatch.setattr(
        "app.routers.papers.grade_writing_response",
        lambda **kwargs: {
            "content": 5,
            "language": 5,
            "organization": 5,
            "overall": 5,
            "summary_feedback": "ok",
            "improvement": {},
            "sentence_feedback": [],
        },
    )

    first = client.post(
        f"/papers/writing/{writing_paper.id}/submit",
        headers=auth_header(student),
        json={
            "assignment_id": assignment.id,
            "responses": [{"question_id": writing_question.id, "answer": "My essay"}],
        },
    )
    assert first.status_code == 200

    second = client.post(
        f"/papers/writing/{writing_paper.id}/submit",
        headers=auth_header(student),
        json={
            "assignment_id": assignment.id,
            "responses": [{"question_id": writing_question.id, "answer": "My second essay"}],
        },
    )
    assert second.status_code == 400
    assert "attempt" in second.json()["detail"].lower()

    assignment.max_attempts = 99
    assignment.deadline = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    late = client.post(
        f"/papers/writing/{writing_paper.id}/submit",
        headers=auth_header(student),
        json={
            "assignment_id": assignment.id,
            "responses": [{"question_id": writing_question.id, "answer": "Late essay"}],
        },
    )
    assert late.status_code == 400
    assert "deadline" in late.json()["detail"].lower()
