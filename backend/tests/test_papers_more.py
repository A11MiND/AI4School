from app.auth import jwt
from app.models.user import User
from app.models.class_model import ClassModel
from app.models.student_association import StudentClass
from app.models.paper import Paper
from app.models.question import Question
from app.models.assignment import Assignment
from app.models.submission import Submission, Answer
from app.routers.papers import _to_list


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def seed_with_assignment(db_session):
    teacher = User(username="teacher_more", password_hash=jwt.get_password_hash("pass"), role="teacher")
    student = User(username="student_more", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add_all([teacher, student])
    db_session.commit()

    class_ = ClassModel(name="Class More", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    assoc = StudentClass(user_id=student.id, class_id=class_.id)
    db_session.add(assoc)
    db_session.commit()

    paper = Paper(title="Paper More", article_content="Text", created_by=teacher.id, class_id=class_.id)
    db_session.add(paper)
    db_session.commit()

    question = Question(paper_id=paper.id, question_text="Q", question_type="mcq", options=["A"], correct_answer="A")
    db_session.add(question)
    db_session.commit()

    assignment = Assignment(paper_id=paper.id, class_id=class_.id)
    db_session.add(assignment)
    db_session.commit()

    return teacher, student, paper, question


def test_get_paper_assignment_and_submission(client, db_session):
    teacher, student, paper, question = seed_with_assignment(db_session)

    submission = Submission(student_id=student.id, paper_id=paper.id, score=50)
    db_session.add(submission)
    db_session.commit()

    answer = Answer(submission_id=submission.id, question_id=question.id, answer="A", score=1, is_correct=True)
    db_session.add(answer)
    db_session.commit()

    res = client.get(f"/papers/{paper.id}", headers=auth_header(student))
    assert res.status_code == 200
    data = res.json()
    assert data["assignment"]["max_attempts"] is not None
    assert data["submission"]["id"] == submission.id


def test_update_question_fields(client, db_session):
    teacher, student, paper, question = seed_with_assignment(db_session)

    res = client.put(
        f"/papers/questions/{question.id}",
        headers=auth_header(teacher),
        json={"question_text": "Updated", "options": ["B"], "correct_answer": "B", "question_type": "tf"}
    )
    assert res.status_code == 200
    assert res.json()["correct_answer"] == "B"


def test_update_question_not_owner(client, db_session):
    teacher, student, paper, question = seed_with_assignment(db_session)

    other = User(username="teacher_other", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(other)
    db_session.commit()

    res = client.put(
        f"/papers/questions/{question.id}",
        headers=auth_header(other),
        json={"question_text": "Nope"}
    )
    assert res.status_code == 403


def test_submit_paper_no_answers(client, db_session):
    teacher, student, paper, question = seed_with_assignment(db_session)

    res = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={"answers": []}
    )
    assert res.status_code == 200
    assert res.json()["score"] == 0


def test_submit_paper_wrong_objective(client, db_session):
    teacher, student, paper, question = seed_with_assignment(db_session)

    res = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={"answers": [{"question_id": question.id, "answer": "Wrong"}]}
    )
    assert res.status_code == 200
    assert res.json()["score"] == 0.0


def test_update_answer_score_forbidden(client, db_session):
    teacher, student, paper, question = seed_with_assignment(db_session)

    res_submit = client.post(
        f"/papers/{paper.id}/submit",
        headers=auth_header(student),
        json={"answers": [{"question_id": question.id, "answer": "A"}]}
    )
    assert res_submit.status_code == 200

    answer = db_session.query(Answer).filter(Answer.question_id == question.id).first()
    assert answer is not None

    res = client.put(
        f"/papers/submissions/answers/{answer.id}/score",
        headers=auth_header(student),
        json={"score": 1}
    )
    assert res.status_code == 403


def test_to_list_dict_no_answer():
    assert _to_list("{\"foo\": 1}") == ["{'foo': 1}"]
