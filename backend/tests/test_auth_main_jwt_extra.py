import asyncio
from datetime import timedelta
import pytest
from fastapi import HTTPException
from app.auth import jwt as jwt_module
from app.models.user import User


def test_register_invalid_role(client):
    res = client.post("/auth/register", json={
        "username": "badrole",
        "password": "pass",
        "role": "invalid"
    })
    assert res.status_code == 400


def test_root_and_token(client, db_session):
    user = User(username="token_user", password_hash=jwt_module.get_password_hash("pass"), role="teacher")
    db_session.add(user)
    db_session.commit()

    res_root = client.get("/")
    assert res_root.status_code == 200
    assert res_root.json()["message"] == "Welcome to AI4School API"

    res_token = client.post("/token", data={"username": "token_user", "password": "pass"})
    assert res_token.status_code == 200
    assert "access_token" in res_token.json()

    res_bad = client.post("/token", data={"username": "token_user", "password": "wrong"})
    assert res_bad.status_code == 401


def test_jwt_helpers(db_session):
    hashed = jwt_module.get_password_hash("secret")
    assert jwt_module.verify_password("secret", hashed)

    token = jwt_module.create_access_token({"sub": "someone"}, expires_delta=timedelta(minutes=1))
    assert isinstance(token, str)


def test_get_current_user_missing_sub(db_session):
    token = jwt_module.create_access_token({"role": "teacher"}, expires_delta=timedelta(minutes=1))
    with pytest.raises(HTTPException):
        asyncio.run(jwt_module.get_current_user(token=token, db=db_session))


def test_get_current_user_missing_user(db_session):
    token = jwt_module.create_access_token({"sub": "nope"}, expires_delta=timedelta(minutes=1))
    with pytest.raises(HTTPException):
        asyncio.run(jwt_module.get_current_user(token=token, db=db_session))


def test_get_current_user_invalid_token(db_session):
    with pytest.raises(HTTPException):
        asyncio.run(jwt_module.get_current_user(token="invalid", db=db_session))
