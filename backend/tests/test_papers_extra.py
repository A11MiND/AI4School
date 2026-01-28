from app.auth import jwt
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
    assert res_score.json()["total_score"] == 5

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
