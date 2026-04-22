import json
import ssl
import threading
import uuid
import base64
from typing import Dict, List, Optional

import websocket


def _build_ws_url(base_ws_url: str, model: str) -> str:
    url = (base_ws_url or "").strip()
    if not url:
        raise ValueError("Realtime WebSocket URL is required")
    model_name = (model or "").strip()
    if not model_name:
        raise ValueError("Realtime model is required")

    if "?" in url:
        if "model=" in url:
            return url
        return f"{url}&model={model_name}"
    return f"{url}?model={model_name}"


def probe_qwen_realtime_ws(
    api_key: str,
    model: str = "qwen3.5-omni-plus-realtime",
    base_ws_url: str = "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime",
    voice: str = "Ethan",
    timeout_seconds: int = 12,
    verify_ssl: bool = True,
) -> Dict[str, object]:
    token = (api_key or "").strip()
    if not token:
        raise ValueError("QWEN_API_KEY is required")

    ws_url = _build_ws_url(base_ws_url, model)
    headers = [f"Authorization: Bearer {token}"]

    event_log: List[str] = []
    errors: List[str] = []
    lock = threading.Lock()
    done = threading.Event()
    status = {
        "connected": False,
        "session_created": False,
        "session_updated": False,
    }

    def _record_event(event_type: Optional[str]) -> None:
        if not event_type:
            return
        with lock:
            event_log.append(event_type)

    def on_open(ws):
        status["connected"] = True
        session_payload = {
            "event_id": f"probe_{uuid.uuid4().hex}",
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "voice": voice,
                "input_audio_format": "pcm",
                "output_audio_format": "pcm",
                "instructions": "You are an English speaking examiner for students.",
                "turn_detection": {
                    "type": "semantic_vad",
                    "threshold": 0.5,
                    "silence_duration_ms": 800,
                },
            },
        }
        ws.send(json.dumps(session_payload, ensure_ascii=False))

    def on_message(ws, message):
        try:
            payload = json.loads(message)
            event_type = payload.get("type")
            _record_event(event_type)
            if event_type == "session.created":
                status["session_created"] = True
            if event_type == "session.updated":
                status["session_updated"] = True
                done.set()
                ws.close()
        except Exception as exc:  # noqa: BLE001
            errors.append(f"message parse error: {exc}")

    def on_error(ws, error):
        errors.append(str(error))
        done.set()

    def on_close(ws, close_status_code, close_msg):
        if close_status_code:
            _record_event(f"close:{close_status_code}")
        if close_msg:
            _record_event(f"close_msg:{close_msg}")
        done.set()

    ws_app = websocket.WebSocketApp(
        ws_url,
        header=headers,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )

    sslopt = {"cert_reqs": ssl.CERT_REQUIRED} if verify_ssl else {"cert_reqs": ssl.CERT_NONE}
    t = threading.Thread(
        target=ws_app.run_forever,
        kwargs={"ping_interval": 20, "ping_timeout": 10, "sslopt": sslopt},
        daemon=True,
    )
    t.start()

    done.wait(timeout=max(3, timeout_seconds))
    if t.is_alive():
        ws_app.close()
        t.join(timeout=2)

    return {
        "ok": bool(status["connected"] and status["session_updated"] and not errors),
        "connected": status["connected"],
        "session_created": status["session_created"],
        "session_updated": status["session_updated"],
        "events": event_log[:20],
        "errors": errors,
        "ws_url": ws_url,
        "model": model,
    }


def synthesize_text_pcm_via_realtime_ws(
    api_key: str,
    text: str,
    voice: str = "Ethan",
    model: str = "qwen3.5-omni-plus-realtime",
    base_ws_url: str = "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime",
    timeout_seconds: int = 25,
    verify_ssl: bool = True,
) -> bytes:
    token = (api_key or "").strip()
    content = (text or "").strip()
    if not token:
        raise ValueError("QWEN_API_KEY is required")
    if not content:
        raise ValueError("Text is required for realtime synthesis")

    ws_url = _build_ws_url(base_ws_url, model)
    headers = [f"Authorization: Bearer {token}"]

    audio_chunks: List[bytes] = []
    errors: List[str] = []
    done = threading.Event()

    def on_open(ws):
        ws.send(json.dumps({
            "event_id": f"session_{uuid.uuid4().hex}",
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "voice": voice,
                "input_audio_format": "pcm",
                "output_audio_format": "pcm",
                "instructions": "Read the user message naturally and exactly without adding extra words.",
                "turn_detection": None,
            },
        }, ensure_ascii=False))

        ws.send(json.dumps({
            "event_id": f"msg_{uuid.uuid4().hex}",
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": f"Please read exactly: {content}"}],
            },
        }, ensure_ascii=False))

        ws.send(json.dumps({
            "event_id": f"resp_{uuid.uuid4().hex}",
            "type": "response.create",
            "response": {"modalities": ["text", "audio"]},
        }, ensure_ascii=False))

    def on_message(ws, message):
        try:
            payload = json.loads(message)
            event_type = payload.get("type")
            if event_type == "response.audio.delta":
                delta = payload.get("delta")
                if delta:
                    audio_chunks.append(base64.b64decode(delta))
            elif event_type == "error":
                errors.append(str(payload))
                done.set()
                ws.close()
            elif event_type == "response.done":
                done.set()
                ws.close()
        except Exception as exc:  # noqa: BLE001
            errors.append(f"message parse error: {exc}")
            done.set()
            ws.close()

    def on_error(ws, error):
        errors.append(str(error))
        done.set()

    def on_close(ws, close_status_code, close_msg):
        if close_status_code and close_status_code >= 4000:
            errors.append(f"ws closed: {close_status_code} {close_msg or ''}".strip())
        done.set()

    ws_app = websocket.WebSocketApp(
        ws_url,
        header=headers,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )

    sslopt = {"cert_reqs": ssl.CERT_REQUIRED} if verify_ssl else {"cert_reqs": ssl.CERT_NONE}
    t = threading.Thread(
        target=ws_app.run_forever,
        kwargs={"ping_interval": 20, "ping_timeout": 10, "sslopt": sslopt},
        daemon=True,
    )
    t.start()

    done.wait(timeout=max(8, timeout_seconds))
    if t.is_alive():
        ws_app.close()
        t.join(timeout=2)

    if errors:
        raise ValueError(f"Realtime WS synthesis failed: {errors[0]}")
    pcm = b"".join(audio_chunks)
    if not pcm:
        raise ValueError("Realtime WS synthesis returned empty audio")
    return pcm
