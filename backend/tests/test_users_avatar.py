import os
from app.auth import jwt
from app.models.user import User


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_avatar_upload(client, db_session):
    user = User(username="teacher_avatar", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(user)
    db_session.commit()

    file_content = b"avatar-bytes"
    files = {"file": ("avatar.png", file_content, "image/png")}
    res = client.post("/users/me/avatar", headers=auth_header(user), files=files)
    assert res.status_code == 200
    data = res.json()
    assert "avatar_url" in data
    assert data["avatar_url"].startswith("uploads/avatars/")

    file_path = os.path.join("/Users/allmind/Desktop/Work/AI4School/backend", data["avatar_url"])
    assert os.path.exists(file_path)


def test_upload_avatar_creates_dir(client, db_session, monkeypatch):
    user = User(username="avatar_user2", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(user)
    db_session.commit()

    from app.routers import users as users_router

    def fake_exists(path):
        return False

    made = {"ok": False}

    def fake_makedirs(path):
        made["ok"] = True

    monkeypatch.setattr(users_router.os.path, "exists", fake_exists)
    monkeypatch.setattr(users_router.os, "makedirs", fake_makedirs)

    files = {"file": ("avatar2.png", b"data", "image/png")}
    res = client.post("/users/me/avatar", headers=auth_header(user), files=files)
    assert res.status_code == 200
    assert made["ok"] is True
