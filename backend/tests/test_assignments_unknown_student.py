from app.auth import jwt
from app.models.user import User
from app.models.paper import Paper
from app.models.assignment import Assignment


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_assignment_unknown_student_target(client, db_session):
    teacher = User(username="teacher_unknown", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    paper = Paper(title="Paper Unknown", article_content="Text", created_by=teacher.id)
    db_session.add(paper)
    db_session.commit()

    assignment = Assignment(paper_id=paper.id, student_id=999)
    db_session.add(assignment)
    db_session.commit()

    res_list = client.get(f"/assignments/paper/{paper.id}", headers=auth_header(teacher))
    assert res_list.status_code == 200
    assert res_list.json()[0]["target_name"] == "Unknown Student"
