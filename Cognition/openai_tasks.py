from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_CHAT_MODEL = os.environ.get("COGNITION_OPENAI_MODEL") or os.environ.get("OPENAI_MODEL") or "gpt-5.1"
DEFAULT_REASONING_EFFORT = os.environ.get("COGNITION_OPENAI_REASONING_EFFORT") or os.environ.get("OPENAI_REASONING_EFFORT") or "high"
DEFAULT_EMBEDDING_MODEL = os.environ.get("COGNITION_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
OPENAI_API_BASE = os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
OPENAI_TIMEOUT_SECONDS = int(os.environ.get("COGNITION_OPENAI_TIMEOUT_SECONDS", os.environ.get("OPENAI_TIMEOUT_SECONDS", "180")) or "180")
ENV_YAML_PATHS = (Path("/root/RooCode/.env.yml"), Path("/root/RooCode/env.yml"))


def _load_key_from_yaml(key_name: str, yaml_path: Path) -> str:
    if not yaml_path.exists():
        return ""
    try:
        import yaml

        with yaml_path.open(encoding="utf-8") as fh:
            payload = yaml.safe_load(fh) or {}
        return str(payload.get(key_name) or "").strip()
    except Exception:
        return ""


def load_openai_api_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return key
    for yaml_path in ENV_YAML_PATHS:
        loaded = _load_key_from_yaml("OPENAI_API_KEY", yaml_path)
        if loaded:
            return loaded
    return ""


def _request(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    api_key = load_openai_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY não configurada (env var ou /root/RooCode/.env.yml)")

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OPENAI_API_BASE}{path}",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=OPENAI_TIMEOUT_SECONDS) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"OpenAI HTTP {exc.code}: {body[:500]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"OpenAI request failed: {exc}") from exc

    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise RuntimeError("OpenAI retornou payload JSON inválido")
    return parsed


def _chat_json(system_prompt: str, user_payload: dict[str, Any], *, model: str = DEFAULT_CHAT_MODEL, reasoning_effort: str = DEFAULT_REASONING_EFFORT) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
        "reasoning_effort": reasoning_effort,
        "response_format": {"type": "json_object"},
    }
    parsed = _request("/chat/completions", payload)
    choices = parsed.get("choices")
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("OpenAI retornou payload sem choices")
    first = choices[0]
    if not isinstance(first, dict):
        raise RuntimeError("OpenAI retornou choice inválido")
    message = first.get("message")
    if not isinstance(message, dict):
        raise RuntimeError("OpenAI retornou message inválida")
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("OpenAI retornou content vazio")
    return json.loads(content)


def embed_texts(texts: list[str], *, model: str = DEFAULT_EMBEDDING_MODEL) -> list[list[float]]:
    payload = {
        "model": model,
        "input": texts,
    }
    parsed = _request("/embeddings", payload)
    data = parsed.get("data")
    if not isinstance(data, list):
        raise RuntimeError("OpenAI embeddings sem campo data")
    vectors: list[list[float]] = []
    for row in data:
        if not isinstance(row, dict) or not isinstance(row.get("embedding"), list):
            raise RuntimeError("OpenAI embeddings retornou linha inválida")
        vectors.append([float(value) for value in row["embedding"]])
    return vectors


def cosine_similarity(left: str, right: str) -> float:
    left_clean = left.strip()
    right_clean = right.strip()
    if not left_clean or not right_clean:
        return 0.0
    left_vec, right_vec = embed_texts([left_clean, right_clean])
    if not left_vec or not right_vec:
        return 0.0
    dot = sum(a * b for a, b in zip(left_vec, right_vec))
    left_norm = math.sqrt(sum(a * a for a in left_vec))
    right_norm = math.sqrt(sum(b * b for b in right_vec))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return max(-1.0, min(1.0, dot / (left_norm * right_norm)))


def generate_reading_passage(*, difficulty: str, target_idea_units: int, avoid_themes: list[str]) -> dict[str, Any]:
    system_prompt = (
        "Você gera textos originais em pt-BR para um módulo diário de aferição cognitiva N=1. "
        "Retorne JSON estrito com as chaves `passage` e `idea_units`. "
        "O texto deve ter 150 a 200 palavras, ser expositivo-narrativo simples, com dificuldade estável, "
        "sem listas, sem markdown, sem linguagem clínica alarmista e sem repetir temas recentes. "
        "As `idea_units` devem ser uma lista canônica de 15 a 20 unidades de ideia curtas e verificáveis."
    )
    result = _chat_json(
        system_prompt,
        {
            "category": "generate_reading_passage",
            "difficulty": difficulty,
            "target_idea_units": target_idea_units,
            "language": "pt-BR",
            "avoid_themes": avoid_themes,
        },
    )
    return result


def score_reading_recall(*, passage: str, idea_units: list[str], recall_text: str) -> dict[str, Any]:
    system_prompt = (
        "Você avalia recall livre de um texto em pt-BR para rastreamento cognitivo longitudinal. "
        "Retorne JSON estrito com: `recovered`, `recovered_count`, `total_units`, `gist_score`, `detail_score`, `intrusions`. "
        "`recovered` deve listar apenas unidades canônicas realmente lembradas. "
        "`gist_score` e `detail_score` vão de 0 a 1. `intrusions` lista conteúdo não apoiado pelo texto."
    )
    result = _chat_json(
        system_prompt,
        {
            "category": "score_reading_recall",
            "passage": passage,
            "idea_units": idea_units,
            "recall_text": recall_text,
            "language": "pt-BR",
        },
    )
    result["semantic_similarity"] = cosine_similarity(passage, recall_text)
    return result


def score_verbal_fluency(*, fluency_type: str, criterion: str, words: list[str]) -> dict[str, Any]:
    system_prompt = (
        "Você avalia fluência verbal em pt-BR usando uma adaptação prática do método de Troyer. "
        "Retorne JSON estrito com: `valid_count`, `invalid`, `repeats`, `clusters`, `mean_cluster_size`, `switch_count`. "
        "`clusters` deve ser uma lista de objetos `{members: string[]}` em ordem de produção. "
        "Conte como repetição a mesma palavra base repetida. Conte intrusões fora da regra em `invalid`."
    )
    return _chat_json(
        system_prompt,
        {
            "category": "score_verbal_fluency",
            "fluency_type": fluency_type,
            "criterion": criterion,
            "words": words,
            "language": "pt-BR",
        },
    )
