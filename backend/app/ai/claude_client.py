"""Minimal Claude Messages API client with structured JSON output (`output_config.format`).

We call the HTTP API directly with httpx so the integration is easy to read,
easy to mock in tests, and has explicit timeouts and bounded retries.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx

from app.ai.health import health
from app.core.config import get_settings

log = logging.getLogger("boltitoli.ai.claude")
PROVIDER = "claude"
RETRYABLE = {408, 409, 429, 500, 502, 503, 504, 529}


class ProviderError(Exception):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


def is_available() -> bool:
    s = get_settings()
    health.register(PROVIDER, s.claude_enabled)
    return health.available(PROVIDER)


def _closed(schema: Any) -> Any:
    """Copy of a JSON schema with `additionalProperties: false` on every object (required by structured outputs)."""
    if isinstance(schema, dict):
        out = {k: _closed(v) for k, v in schema.items()}
        if out.get("type") == "object":
            out["additionalProperties"] = False
        return out
    if isinstance(schema, list):
        return [_closed(v) for v in schema]
    return schema


def call_tool(*, model: str, system: str, user: str, tool_name: str, tool_description: str,
              input_schema: dict[str, Any], max_tokens: int = 800, timeout: float | None = None,
              max_retries: int = 2) -> dict[str, Any]:
    """Ask Claude for JSON matching `input_schema` and return it as a dict.

    Current models reject forced `tool_choice`, so this uses structured outputs; `tool_name` and
    `tool_description` are kept for callers and logs.
    """
    s = get_settings()
    if not is_available():
        raise ProviderError("unavailable", "Claude is not configured or is cooling down")

    body = {
        "model": model,
        # thinking is on by default and counts toward max_tokens, so leave headroom beyond the answer size
        "max_tokens": max(max_tokens, 4000),
        "system": f"{system}\n\nTask: {tool_description}",
        "messages": [{"role": "user", "content": user}],
        # short, routine outputs: low effort keeps them fast (live feedback has a 4 s budget) and cheap
        "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": _closed(input_schema)}},
    }
    headers = {
        "x-api-key": s.anthropic_api_key or "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    url = f"{s.anthropic_base_url.rstrip('/')}/v1/messages"
    attempt = 0
    last_code = "unknown"
    while attempt <= max_retries:
        attempt += 1
        try:
            resp = httpx.post(url, json=body, headers=headers, timeout=timeout or s.anthropic_timeout_seconds)
        except httpx.TimeoutException:
            last_code = "timeout"
        except httpx.HTTPError:
            last_code = "network_error"
        else:
            if resp.status_code == 200:
                data = resp.json()
                stop = data.get("stop_reason")
                text = next((b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"), "")
                if stop in ("refusal", "max_tokens"):
                    last_code = stop  # output may not match the schema; not retryable
                    break
                try:
                    out = json.loads(text)
                except ValueError:
                    last_code = "invalid_json"
                    break
                health.ok(PROVIDER)
                return out if isinstance(out, dict) else {}
            last_code = f"http_{resp.status_code}"
            if resp.status_code not in RETRYABLE:
                break
        if attempt <= max_retries:
            time.sleep(min(0.4 * 2 ** (attempt - 1), 2.0))
    health.fail(PROVIDER, last_code)
    log.warning("claude_call_failed", extra={"code": last_code, "attempts": attempt, "tool": tool_name})
    raise ProviderError(last_code)
