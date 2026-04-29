import os
from datetime import datetime, timedelta
from jose import jwt as jose_jwt

from app.auth import jwt
from app.models.control_plane import LlmSecret, School, SchoolMembership, Subscription
from app.models.user import User


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_llm_resolve_prefers_edcokey_then_school_then_byok(client, db_session):
    teacher = User(
        username="teacher_control",
        password_hash=jwt.get_password_hash("pass"),
        role="teacher",
        ai_provider="deepseek",
        ai_model="deepseek-v4-flash",
    )
    school = School(name="Control School")
    db_session.add_all([teacher, school])
    db_session.commit()
    db_session.add(SchoolMembership(school_id=school.id, user_id=teacher.id, role="teacher"))
    db_session.add(Subscription(school_id=school.id, platform="ai4school", plan="pro", status="active", features_json='["*"]'))
    db_session.add(LlmSecret(owner_type="school_key", owner_id=school.id, provider="deepseek", secret_value="school-secret", base_url="https://api.deepseek.com"))
    db_session.add(LlmSecret(owner_type="edcokey", owner_id=None, provider="deepseek", secret_value="edco-secret", base_url="https://api.deepseek.com", quota_total=10, quota_used=1))
    db_session.commit()

    res = client.post(
        "/llm/resolve",
        headers=auth_header(teacher),
        json={"platform": "ai4school", "feature": "reading.generate", "provider": "deepseek", "model": "deepseek-v4-flash"},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["allowed"] is True
    assert body["key_source"] == "edcokey"
    assert body["server_secret_ref"].startswith("llm_secret:")
    assert "edco-secret" not in str(body)


def test_llm_resolve_blocks_without_subscription_when_required(client, db_session, monkeypatch):
    monkeypatch.setenv("EDCO_REQUIRE_SUBSCRIPTION", "1")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    teacher = User(username="teacher_no_sub", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    res = client.post(
        "/llm/resolve",
        headers=auth_header(teacher),
        json={"platform": "ai4school", "feature": "reading.generate", "provider": "deepseek"},
    )

    assert res.status_code == 200
    assert res.json()["allowed"] is False
    assert "subscription" in res.json()["deny_reason"].lower()


def test_llm_usage_records_without_returning_secret(client, db_session):
    teacher = User(username="teacher_usage", password_hash=jwt.get_password_hash("pass"), role="teacher")
    school = School(name="Usage School")
    db_session.add_all([teacher, school])
    db_session.commit()
    db_session.add(SchoolMembership(school_id=school.id, user_id=teacher.id, role="teacher"))
    db_session.commit()

    res = client.post(
        "/llm/usage",
        headers=auth_header(teacher),
        json={
            "school_id": school.id,
            "platform": "ai4school",
            "feature": "speaking.dialogue",
            "provider": "deepseek",
            "model": "deepseek-v4-flash",
            "key_source": "edcokey",
            "estimated_usage": 2,
        },
    )

    assert res.status_code == 200
    assert isinstance(res.json()["id"], int)


def test_adapter_user_sync_and_summary(client, db_session):
    admin = User(username="admin_control", password_hash=jwt.get_password_hash("pass"), role="admin")
    db_session.add(admin)
    db_session.commit()

    sync = client.post(
        "/adapter/users/sync",
        headers=auth_header(admin),
        json={
            "users": [
                {
                    "global_user_id": "g-student-1",
                    "platform": "ai4school",
                    "local_user_id": "42",
                    "school_id": 1,
                    "class_id": 7,
                    "role": "student",
                }
            ]
        },
    )
    assert sync.status_code == 200
    assert sync.json()["upserted"] == 1

    event = client.post(
        "/events/learning",
        headers=auth_header(admin),
        json={
            "event_type": "AssessmentSubmitted",
            "global_user_id": "g-student-1",
            "platform": "ai4school",
            "subject": "speaking",
            "payload": {"score": 72},
        },
    )
    assert event.status_code == 200

    summary = client.get("/adapter/students/g-student-1/summary", headers=auth_header(admin))
    assert summary.status_code == 200
    assert summary.json()["platform_mappings"][0]["local_user_id"] == "42"
    assert summary.json()["recent_events"][0]["event_type"] == "AssessmentSubmitted"


def test_admin_can_create_control_plane_records(client, db_session):
    admin = User(username="admin_setup", password_hash=jwt.get_password_hash("pass"), role="admin")
    teacher = User(username="teacher_setup", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add_all([admin, teacher])
    db_session.commit()

    school_res = client.post(
        "/control/schools",
        headers=auth_header(admin),
        json={"name": "Setup School", "external_ref": "setup-school"},
    )
    assert school_res.status_code == 200
    school_id = school_res.json()["id"]

    membership_res = client.post(
        f"/control/schools/{school_id}/memberships",
        headers=auth_header(admin),
        json={"user_id": teacher.id, "role": "teacher"},
    )
    assert membership_res.status_code == 200

    subscription_res = client.post(
        "/control/subscriptions",
        headers=auth_header(admin),
        json={"school_id": school_id, "platform": "ai4school", "plan": "pro", "features": ["*"]},
    )
    assert subscription_res.status_code == 200

    secret_res = client.post(
        "/control/llm-secrets",
        headers=auth_header(admin),
        json={
            "owner_type": "school_key",
            "owner_id": school_id,
            "provider": "deepseek",
            "api_key": "school-api-key",
            "base_url": "https://api.deepseek.com",
        },
    )
    assert secret_res.status_code == 200
    assert secret_res.json()["server_secret_ref"].startswith("llm_secret:")
    assert "school-api-key" not in str(secret_res.json())


def test_adapter_sso_launch_jit_provisions_teacher(client, db_session, monkeypatch):
    monkeypatch.setenv("ONE_FOR_ALL_LAUNCH_SECRET", "one-for-all-dev-launch-secret")
    token = jose_jwt.encode(
        {
            "iss": "one-for-all",
            "typ": "platform_launch",
            "exp": datetime.utcnow() + timedelta(minutes=5),
            "global_user_id": "teacher:99",
            "school_id": 123,
            "platform": "ai4school",
            "role": "teacher",
            "email": "sso.teacher@example.com",
            "name": "SSO Teacher",
        },
        "one-for-all-dev-launch-secret",
        algorithm="HS256",
    )

    res = client.post("/adapter/sso/launch", json={"token": token})

    assert res.status_code == 200
    body = res.json()
    assert body["access_token"]
    assert body["role"] == "teacher"
    assert body["global_user_id"] == "teacher:99"
