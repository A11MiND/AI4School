from app.auth import jwt
from app.models.user import User


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_register_and_login(client, db_session):
    res = client.post("/auth/register", json={
        "username": "student_one",
        "password": "pass123",
        "role": "student"
    })
    assert res.status_code == 200

    res_dup = client.post("/auth/register", json={
        "username": "student_one",
        "password": "pass123",
        "role": "student"
    })
    assert res_dup.status_code == 400

    res_login = client.post("/auth/login", json={
        "username": "student_one",
        "password": "pass123"
    })
    assert res_login.status_code == 200
    assert "access_token" in res_login.json()

    res_bad = client.post("/auth/login", json={
        "username": "student_one",
        "password": "wrong"
    })
    assert res_bad.status_code == 401


def test_users_me_update(client, db_session):
    user = User(username="teacher_one", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(user)
    db_session.commit()

    res_me = client.get("/users/me", headers=auth_header(user))
    assert res_me.status_code == 200
    assert res_me.json()["username"] == "teacher_one"

    res_update = client.put("/users/me", headers=auth_header(user), json={
        "username": "teacher_renamed",
        "full_name": "Teacher A"
    })
    assert res_update.status_code == 200
    assert res_update.json()["username"] == "teacher_renamed"
