from typing import Iterable, Optional


def estimate_tokens(text: Optional[str]) -> int:
    if not text:
        return 0
    # Rough heuristic: ~4 chars/token for English-like text
    return max(1, len(text) // 4)


def compress_dialogue(previous_summary: Optional[str], lines: Iterable[str], max_chars: int = 900) -> str:
    joined = " ".join([line.strip() for line in lines if line and line.strip()])
    if not joined:
        return previous_summary or ""

    head = joined[:max_chars]
    if len(joined) > max_chars:
        head = head.rstrip() + " ..."

    if previous_summary:
        merged = f"{previous_summary}\n{head}"
    else:
        merged = head

    if len(merged) > max_chars * 2:
        merged = merged[-(max_chars * 2):]
    return merged
