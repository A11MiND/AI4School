import os
import uuid
import wave
from pathlib import Path
from typing import Dict, List, Optional

import requests
from .qwen_realtime import synthesize_text_pcm_via_realtime_ws


def _normalize_base_url(base_url: str) -> str:
    return (base_url or "").rstrip("/")


def _safe_upload_dir() -> Path:
    upload_dir = Path("uploads") / "audio"
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


def _write_pcm_wav(pcm_bytes: bytes, file_path: Path, sample_rate: int) -> None:
    with wave.open(str(file_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_bytes)


def synthesize_qwen_tts_pcm(
    text: str,
    model: str,
    voice: str,
    api_key: str,
    base_url: str,
    timeout_seconds: int = 120,
) -> bytes:
    cleaned_text = (text or "").strip()
    if not cleaned_text:
        raise ValueError("Text is empty")

    token = (api_key or "").strip()
    if not token:
        raise ValueError("QWEN_API_KEY not configured")

    root = _normalize_base_url(base_url or "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
    if not root:
        raise ValueError("Qwen base URL is empty")

    endpoint = f"{root}/audio/speech"
    payload = {
        "model": model,
        "voice": voice,
        "input": cleaned_text,
        "response_format": "pcm",
    }

    response = requests.post(
        endpoint,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=timeout_seconds,
    )
    if response.status_code < 400 and response.content:
        return response.content

    # DashScope intl compatible REST may not expose /audio/speech for some models.
    # Fallback to Realtime WS synthesis to keep listening/speaking usable.
    try:
        ws_url = os.getenv("QWEN_REALTIME_WS_URL") or (
            "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime"
            if "intl" in root
            else "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
        )
        ws_model = os.getenv("QWEN_REALTIME_MODEL", "qwen3.5-omni-plus-realtime")
        verify_ssl = os.getenv("QWEN_REALTIME_VERIFY_SSL", "1") != "0"
        return synthesize_text_pcm_via_realtime_ws(
            api_key=token,
            text=cleaned_text,
            voice=voice or "Ethan",
            model=ws_model,
            base_ws_url=ws_url,
            timeout_seconds=25,
            verify_ssl=verify_ssl,
        )
    except Exception as ws_exc:
        detail = response.text[:500] if response is not None else ""
        raise ValueError(f"Qwen TTS failed: HTTP {response.status_code}: {detail}; realtime fallback failed: {ws_exc}")


def synthesize_role_script_to_wav(
    role_script: List[Dict[str, str]],
    model: str,
    default_voice: str,
    role_voice_map: Optional[Dict[str, str]],
    api_key: str,
    base_url: str,
    sample_rate: int = 24000,
) -> Dict[str, object]:
    rows = []
    for item in role_script or []:
        role = str((item or {}).get("role") or "A").strip() or "A"
        text = str((item or {}).get("text") or "").strip()
        if text:
            rows.append({"role": role, "text": text})

    if not rows:
        raise ValueError("role_script is empty")

    voice_map = {str(k).strip(): str(v).strip() for k, v in (role_voice_map or {}).items() if str(k).strip() and str(v).strip()}
    uploads_dir = _safe_upload_dir()

    combined_pcm_parts: List[bytes] = []
    segment_payload: List[Dict[str, object]] = []

    for idx, row in enumerate(rows, start=1):
        role = str(row["role"])
        voice = voice_map.get(role) or default_voice
        pcm = synthesize_qwen_tts_pcm(
            text=str(row["text"]),
            model=model,
            voice=voice,
            api_key=api_key,
            base_url=base_url,
        )
        combined_pcm_parts.append(pcm)

        segment_name = f"segment_{uuid.uuid4().hex}_{idx}.wav"
        segment_path = uploads_dir / segment_name
        _write_pcm_wav(pcm, segment_path, sample_rate=sample_rate)

        duration_ms = int((len(pcm) / 2 / max(sample_rate, 1)) * 1000)
        segment_payload.append({
            "role": role,
            "voice": voice,
            "text": row["text"],
            "audio_url": f"/uploads/audio/{segment_name}",
            "duration_ms": duration_ms,
        })

    merged_pcm = b"".join(combined_pcm_parts)
    merged_name = f"listening_{uuid.uuid4().hex}.wav"
    merged_path = uploads_dir / merged_name
    _write_pcm_wav(merged_pcm, merged_path, sample_rate=sample_rate)

    return {
        "audio_url": f"/uploads/audio/{merged_name}",
        "segments": segment_payload,
        "sample_rate": sample_rate,
        "format": "wav",
        "provider": "qwen",
        "model": model,
        "voice": default_voice,
    }


def synthesize_single_text_to_wav(
    text: str,
    model: str,
    voice: str,
    api_key: str,
    base_url: str,
    sample_rate: int = 24000,
) -> str:
    pcm = synthesize_qwen_tts_pcm(
        text=text,
        model=model,
        voice=voice,
        api_key=api_key,
        base_url=base_url,
    )
    uploads_dir = _safe_upload_dir()
    file_name = f"speaking_{uuid.uuid4().hex}.wav"
    file_path = uploads_dir / file_name
    _write_pcm_wav(pcm, file_path, sample_rate=sample_rate)
    return f"/uploads/audio/{file_name}"
