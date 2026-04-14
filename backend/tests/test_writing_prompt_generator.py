from app.services import writing_prompt_generator as wpg


def test_generate_writing_prompts_passes_runtime_credentials(monkeypatch):
    captured = {}

    def fake_resolve(_options):
        return "deepseek", "deepseek-chat"

    def fake_call_chat(**kwargs):
        captured.update(kwargs)
        return """```json
{
  \"task1_prompt\": \"Task 1 prompt\",
  \"task2_prompt_pool\": [\"Task 2 prompt A\", \"Task 2 prompt B\"],
  \"meta\": {\"task_mode\": \"both\"}
}
```"""

    monkeypatch.setattr(wpg, "_resolve_ai_config", fake_resolve)
    monkeypatch.setattr(wpg, "_call_chat", fake_call_chat)

    data = wpg.generate_writing_prompts(
        task_mode="both",
        source_text="source",
        custom_requirements="requirements",
        options={
            "ai_provider": "deepseek",
            "ai_model": "deepseek-chat",
            "api_key": "sk-runtime",
            "base_url": "https://api.deepseek.com/v1",
        },
    )

    assert data["task1_prompt"] == "Task 1 prompt"
    assert len(data["task2_prompt_pool"]) == 2
    assert captured["api_key"] == "sk-runtime"
    assert captured["base_url"] == "https://api.deepseek.com/v1"
