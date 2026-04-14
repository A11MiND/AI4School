from app.auth import jwt
from app.models.user import User


def auth_header(user):
    token = jwt.create_access_token({"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def test_test_connection_openrouter_passes_key_and_base(client, db_session, monkeypatch):
    teacher = User(username="teacher_conn", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    called = {}

    def fake_call_chat(provider, model, system_prompt, user_prompt, temperature, max_tokens, api_key=None, base_url=None):
        called["provider"] = provider
        called["model"] = model
        called["api_key"] = api_key
        called["base_url"] = base_url
        return "Connection Successful"

    monkeypatch.setattr("app.services.ai_generator._call_chat", fake_call_chat)

    res = client.post(
        "/users/test-connection",
        headers=auth_header(teacher),
        json={
            "ai_provider": "openrouter",
            "ai_model": "openai/gpt-audio-mini",
            "api_key": "sk-or-test",
            "base_url": "https://openrouter.ai/api/v1"
        },
    )
    assert res.status_code == 200
    assert called["provider"] == "openrouter"
    assert called["model"] == "openai/gpt-audio-mini"
    assert called["api_key"] == "sk-or-test"
    assert called["base_url"] == "https://openrouter.ai/api/v1"


def test_update_profile_invalid_provider_rejected(client, db_session):
    teacher = User(username="teacher_bad_provider", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    res = client.put(
        "/users/me",
        headers=auth_header(teacher),
        json={"ai_provider": "unknown-provider"},
    )
    assert res.status_code == 400


def test_test_connection_qwen_passes_key_and_base(client, db_session, monkeypatch):
    teacher = User(username="teacher_qwen_conn", password_hash=jwt.get_password_hash("pass"), role="teacher")
    db_session.add(teacher)
    db_session.commit()

    called = {}

    def fake_call_chat(provider, model, system_prompt, user_prompt, temperature, max_tokens, api_key=None, base_url=None):
        called["provider"] = provider
        called["model"] = model
        called["api_key"] = api_key
        called["base_url"] = base_url
        return "Connection Successful"

    monkeypatch.setattr("app.services.ai_generator._call_chat", fake_call_chat)

    res = client.post(
        "/users/test-connection",
        headers=auth_header(teacher),
        json={
            "ai_provider": "qwen",
            "ai_model": "qwen3-tts-instruct-flash",
            "api_key": "sk-qwen-test",
            "base_url": "https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1"
        },
    )
    assert res.status_code == 200
    assert called["provider"] == "qwen"
    # Non-chat models are normalized to a chat-capable fallback in resolver.
    assert called["model"] in {"qwen-plus", "qwen3-tts-instruct-flash"}
    assert called["api_key"] == "sk-qwen-test"
    assert called["base_url"] == "https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1"
