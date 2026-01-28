from app.auth import jwt
from app.models.user import User


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_assignment_delete_forbidden(client, db_session):
    student = User(username="student_no_delete", password_hash=jwt.get_password_hash("pass"), role="student")
    db_session.add(student)
    db_session.commit()

    res = client.delete("/assignments/1", headers=auth_header(student))
    assert res.status_code == 403
