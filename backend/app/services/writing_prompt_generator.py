from __future__ import annotations

from typing import Any, Dict, Optional

from .ai_generator import _call_chat, _extract_json_block, _resolve_ai_config


def _build_system_prompt(task_mode: str) -> str:
    return (
        "You are an HKDSE English Language Paper 2 question setter.\n"
        "Generate official-form exam prompts only, in formal HKEAA style.\n"
        "Return ONLY JSON in a JSON code block.\n\n"
        "JSON schema:\n"
        "{\n"
        '  "task1_prompt": "string or empty",\n'
        '  "task2_prompt_pool": ["string", "..."],\n'
        '  "meta": {"task_mode": "task1|task2|both"}\n'
        "}\n\n"
        "PART A RULES (Task 1):\n"
        "1. Compulsory writing task around 200 words.\n"
        "2. Realistic Hong Kong secondary school campus context.\n"
        "3. Clear text type, target audience, and supporting reference material.\n"
        "4. Exactly 3 explicit mandatory content points.\n"
        "5. Official, formal HKEAA HKDSE exam paper tone and format.\n\n"
        "PART B RULES (Task 2):\n"
        "1. Optional writing task around 400 words.\n"
        "2. Must align with one official HKDSE theme: Social Issues, Workplace Communication, Sports Communication, Debating, Popular Culture, Short Stories, Poems and Songs, Drama.\n"
        "3. Clear text type, realistic Hong Kong local context, and clear writing purpose.\n"
        "4. 3-4 explicit mandatory content points.\n"
        "5. Official, formal HKEAA HKDSE exam paper tone and format.\n\n"
        f"TASK MODE: {task_mode}. Only generate the selected task(s)."
    )


def generate_writing_prompts(
    task_mode: str,
    source_text: Optional[str],
    custom_requirements: Optional[str],
    options: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    mode = (task_mode or "both").strip().lower()
    if mode not in {"task1", "task2", "both"}:
        raise ValueError("Invalid task mode")

    provider, model = _resolve_ai_config(options)
    request_api_key = str((options or {}).get("api_key") or "").strip() or None
    request_base_url = str((options or {}).get("base_url") or "").strip() or None
    system_prompt = _build_system_prompt(mode)

    user_prompt = (
        f"Task mode: {mode}\n\n"
        f"Source material:\n{(source_text or '').strip()[:12000]}\n\n"
        "Custom user specifications (must integrate all):\n"
        f"{(custom_requirements or '').strip() or 'None'}\n\n"
        "For task2_prompt_pool, generate 6 high-quality options when task2 is included."
    )

    content = _call_chat(
        provider=provider,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.3,
        max_tokens=2200,
        api_key=request_api_key,
        base_url=request_base_url,
    )
    data = _extract_json_block(content)
    if not data:
        raise ValueError("AI output parsing failed for writing prompts")

    task1_prompt = str(data.get("task1_prompt") or "").strip()
    task2_pool_raw = data.get("task2_prompt_pool") or []
    task2_pool = []
    if isinstance(task2_pool_raw, list):
        task2_pool = [str(item).strip() for item in task2_pool_raw if str(item).strip()]

    if mode == "task1":
        task2_pool = []
    if mode == "task2":
        task1_prompt = ""

    if mode in {"task1", "both"} and not task1_prompt:
        raise ValueError("Missing generated Task 1 prompt")
    if mode in {"task2", "both"} and not task2_pool:
        raise ValueError("Missing generated Task 2 prompt pool")

    return {
        "task1_prompt": task1_prompt,
        "task2_prompt_pool": task2_pool,
        "meta": {"task_mode": mode, "provider": provider, "model": model},
    }