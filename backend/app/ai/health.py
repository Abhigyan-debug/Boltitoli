"""In-process provider health tracking and a small circuit breaker.

If a provider fails repeatedly we stop calling it for a short cool-down so a
live classroom session falls back immediately instead of waiting on timeouts.
"""

from __future__ import annotations

import threading
import time
from dataclasses import asdict, dataclass

FAILURES_TO_OPEN = 3
COOLDOWN_SECONDS = 30.0


@dataclass
class ProviderStatus:
    name: str
    configured: bool
    last_ok_at: float | None = None
    last_error_at: float | None = None
    last_error_code: str | None = None
    consecutive_failures: int = 0
    open_until: float = 0.0

    @property
    def state(self) -> str:
        if not self.configured:
            return "not_configured"
        if self.open_until > time.time():
            return "cooling_down"
        if self.consecutive_failures:
            return "degraded"
        if self.last_ok_at:
            return "ok"
        return "unknown"

    def public(self) -> dict:
        d = asdict(self)
        d["state"] = self.state
        d.pop("open_until")
        return d


class ProviderHealth:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._s: dict[str, ProviderStatus] = {}

    def register(self, name: str, configured: bool) -> None:
        with self._lock:
            st = self._s.get(name)
            if st is None:
                self._s[name] = ProviderStatus(name, configured)
            else:
                st.configured = configured

    def available(self, name: str) -> bool:
        st = self._s.get(name)
        return bool(st and st.configured and st.open_until <= time.time())

    def _get(self, name: str) -> ProviderStatus:
        return self._s.setdefault(name, ProviderStatus(name, True))

    def ok(self, name: str) -> None:
        with self._lock:
            st = self._get(name)
            st.last_ok_at = time.time()
            st.consecutive_failures = 0
            st.open_until = 0.0

    def fail(self, name: str, code: str) -> None:
        with self._lock:
            st = self._get(name)
            st.last_error_at = time.time()
            st.last_error_code = code
            st.consecutive_failures += 1
            if st.consecutive_failures >= FAILURES_TO_OPEN:
                st.open_until = time.time() + COOLDOWN_SECONDS

    def snapshot(self) -> list[dict]:
        with self._lock:
            return [s.public() for s in self._s.values()]

    def reset(self) -> None:
        with self._lock:
            self._s.clear()


health = ProviderHealth()
