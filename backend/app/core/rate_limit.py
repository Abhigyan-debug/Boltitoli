from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.config import get_settings


def client_ip(request: Request) -> str:
    """Rate-limit key: the visitor address written by our own proxies.

    Each proxy appends the address it saw to X-Forwarded-For, so the entry TRUSTED_PROXY_HOPS from the
    right was added by a proxy we run behind (e.g. 1 = Render, 2 = Vercel then Render). Entries further
    left come from the client and can be forged, so they are never used. 0 = no proxy: use the socket address.
    """
    hops = get_settings().trusted_proxy_hops
    xff = request.headers.get("x-forwarded-for")
    if hops > 0 and xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            return parts[-hops] if len(parts) >= hops else parts[0]
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip, enabled=get_settings().rate_limit_enabled)
