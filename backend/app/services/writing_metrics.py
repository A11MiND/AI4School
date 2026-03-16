from __future__ import annotations

import math
import re
from collections import Counter
from typing import Dict, List

# Selected 9 metrics (3 lexical + 3 syntactic + 3 cohesion)
SELECTED_METRICS = [
    "LD", "TTR", "MSTTR",
    "MLS", "MLT", "C/S",
    "Temporal_token_density", "Expansion_token_density", "Comparison_token_density",
]

_TEMPORAL_MARKERS = {
    "before", "after", "when", "while", "during", "then", "later", "finally", "meanwhile", "subsequently",
}
_EXPANSION_MARKERS = {
    "and", "also", "furthermore", "moreover", "in addition", "besides", "another", "additionally",
}
_COMPARISON_MARKERS = {
    "however", "whereas", "while", "similarly", "likewise", "in contrast", "on the other hand", "but", "than",
}


def _sentences(text: str) -> List[str]:
    if not text:
        return []
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _tokens(text: str) -> List[str]:
    if not text:
        return []
    return re.findall(r"[A-Za-z']+", text.lower())


def _safe_div(a: float, b: float) -> float:
    return 0.0 if b == 0 else a / b


def _msttr(tokens: List[str], segment_size: int = 50) -> float:
    if not tokens:
        return 0.0
    if len(tokens) < segment_size:
        types = len(set(tokens))
        return _safe_div(types, len(tokens))
    ttrs = []
    for i in range(0, len(tokens) - segment_size + 1, segment_size):
        seg = tokens[i : i + segment_size]
        ttrs.append(_safe_div(len(set(seg)), len(seg)))
    return sum(ttrs) / len(ttrs) if ttrs else 0.0


def _approx_t_units(sentences: List[str]) -> int:
    # Heuristic: split by strong coordinating conjunction patterns.
    count = 0
    for s in sentences:
        parts = re.split(r"\b(?:and|but|so|yet)\b", s, flags=re.IGNORECASE)
        count += len([p for p in parts if p.strip()])
    return max(count, len(sentences))


def _approx_clauses(sentences: List[str]) -> int:
    clause_markers = r"\b(?:because|although|when|while|if|that|which|who|where|as|since|unless|though)\b"
    total = 0
    for s in sentences:
        subs = len(re.findall(clause_markers, s, flags=re.IGNORECASE))
        total += 1 + subs
    return total


def _density(tokens: List[str], markers: set[str]) -> float:
    if not tokens:
        return 0.0
    joined = " ".join(tokens)
    count = 0
    for marker in markers:
        if " " in marker:
            count += joined.count(marker)
        else:
            count += tokens.count(marker)
    return _safe_div(count, len(tokens))


def compute_writing_metrics(text: str) -> Dict[str, float]:
    sentences = _sentences(text)
    tokens = _tokens(text)
    content_tokens = [t for t in tokens if t not in {"the", "a", "an", "to", "of", "in", "on", "for", "is", "are", "was", "were", "be", "been", "being", "and", "or", "but"}]

    word_count = len(tokens)
    sent_count = max(len(sentences), 1)
    types = len(set(tokens))
    t_units = max(_approx_t_units(sentences), 1)
    clauses = max(_approx_clauses(sentences), 1)

    metrics = {
        "LD": round(_safe_div(len(content_tokens), word_count), 4),
        "TTR": round(_safe_div(types, word_count), 4),
        "MSTTR": round(_msttr(tokens), 4),
        "MLS": round(_safe_div(word_count, sent_count), 4),
        "MLT": round(_safe_div(word_count, t_units), 4),
        "C/S": round(_safe_div(clauses, sent_count), 4),
        "Temporal_token_density": round(_density(tokens, _TEMPORAL_MARKERS), 4),
        "Expansion_token_density": round(_density(tokens, _EXPANSION_MARKERS), 4),
        "Comparison_token_density": round(_density(tokens, _COMPARISON_MARKERS), 4),
    }

    # Keep contract stable for clients.
    return {k: metrics.get(k, 0.0) for k in SELECTED_METRICS}


def metric_improvement_hints(metrics: Dict[str, float]) -> Dict[str, str]:
    hints: Dict[str, str] = {}

    if metrics.get("LD", 0.0) < 0.45:
        hints["LD"] = "Use more content words (nouns, verbs, adjectives) and reduce filler wording."
    if metrics.get("TTR", 0.0) < 0.4:
        hints["TTR"] = "Increase lexical variety by avoiding repeated high-frequency words."
    if metrics.get("MSTTR", 0.0) < 0.45:
        hints["MSTTR"] = "Try more varied vocabulary across different parts of the essay."

    if metrics.get("MLS", 0.0) < 12:
        hints["MLS"] = "Develop ideas with longer, well-punctuated sentences where appropriate."
    if metrics.get("MLT", 0.0) < 10:
        hints["MLT"] = "Build stronger T-units by adding controlled expansion and subordination."
    if metrics.get("C/S", 0.0) < 1.2:
        hints["C/S"] = "Add subordinate clauses to increase sentence complexity."

    if metrics.get("Temporal_token_density", 0.0) < 0.01:
        hints["Temporal_token_density"] = "Use more temporal connectors (e.g., then, after, meanwhile)."
    if metrics.get("Expansion_token_density", 0.0) < 0.02:
        hints["Expansion_token_density"] = "Use expansion connectors (e.g., moreover, in addition) to elaborate ideas."
    if metrics.get("Comparison_token_density", 0.0) < 0.01:
        hints["Comparison_token_density"] = "Use comparison/contrast markers (e.g., however, whereas) for clearer argumentation."

    return hints
