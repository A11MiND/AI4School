from app.auth import jwt
from app.models.user import User
from app.models.paper import Paper
from app.models.class_model import ClassModel
from app.models.assignment import Assignment


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_assignment_delete_success(client, db_session):
    teacher = User(username="teacher_del", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    class_ = ClassModel(name="Class Del", teacher_id=teacher.id)
    db_session.add(class_)
    db_session.commit()

    paper = Paper(title="Paper Del", article_content="Text", created_by=teacher.id)
    db_session.add(paper)
    db_session.commit()

    assignment = Assignment(paper_id=paper.id, class_id=class_.id)
    db_session.add(assignment)
    db_session.commit()

    res = client.delete(f"/assignments/{assignment.id}", headers=auth_header(teacher))
    assert res.status_code == 200
    assert res.json()["message"] == "Assignment revoked"
