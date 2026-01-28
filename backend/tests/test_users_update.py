from app.auth import jwt
from app.models.user import User


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_update_user_username_taken(client, db_session):
    user1 = User(username="user_one", password_hash=jwt.get_password_hash("pass"), role="teacher")
    user2 = User(username="user_two", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add_all([user1, user2])
    db_session.commit()

    res = client.put(
        "/users/me",
        headers=auth_header(user2),
        json={"username": "user_one"}
    )
    assert res.status_code == 400


def test_update_user_username_success(client, db_session):
    user = User(username="user_old", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(user)
    db_session.commit()

    res = client.put(
        "/users/me",
        headers=auth_header(user),
        json={"username": "user_new"}
    )
    assert res.status_code == 200
    assert res.json()["username"] == "user_new"
