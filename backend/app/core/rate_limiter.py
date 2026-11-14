import time
import threading
import math
from typing import Dict, List, Tuple, Optional
from fastapi import Request, HTTPException, status
from app.core.config import settings

class SlidingWindowRateLimiter:
    """
    Thread-safe, bounded in-memory sliding-window rate limiter for FastAPI endpoints.
    Tracks invocation timestamps per (client_key, endpoint_group).

    NOTE: In-memory rate limiting is process-local. It protects single-instance or free-tier
    cloud deployments against accidental client flooding and rapid scraping.
    For distributed bot-mitigation, a centralized Redis store or edge WAF (Cloudflare/Vercel)
    is recommended.
    """

    def __init__(self, max_keys: int = 5000):
        self._lock = threading.Lock()
        # storage: (client_ip, endpoint_group) -> list of monotonic float timestamps
        self._records: Dict[Tuple[str, str], List[float]] = {}
        self._max_keys = max_keys

    def extract_client_ip(self, request: Request) -> str:
        """
        Extracts client IP. Only honors X-Forwarded-For if TRUST_PROXY_HEADERS is explicitly enabled.
        Otherwise falls back to the direct TCP socket client host.
        """
        trust_proxy = getattr(settings, "TRUST_PROXY_HEADERS", False)
        if isinstance(trust_proxy, str):
            trust_proxy = trust_proxy.strip().lower() in ("true", "1", "yes")

        if bool(trust_proxy):
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                client_ip = forwarded.split(",")[0].strip()
                if client_ip:
                    return client_ip

        if request.client and request.client.host:
            return request.client.host
        return "127.0.0.1"

    def check_rate_limit(
        self,
        request: Request,
        endpoint_group: str,
        max_requests: int,
        window_seconds: int = 60
    ) -> None:
        """
        Checks and records an invocation against the sliding window limit.
        Raises HTTP 429 Too Many Requests if the limit is exceeded.
        """
        rate_limit_enabled = getattr(settings, "RATE_LIMIT_ENABLED", True)
        if isinstance(rate_limit_enabled, str):
            rate_limit_enabled = rate_limit_enabled.strip().lower() in ("true", "1", "yes")
        if not bool(rate_limit_enabled):
            return

        client_ip = self.extract_client_ip(request)
        key = (client_ip, endpoint_group)
        now = time.monotonic()
        cutoff = now - window_seconds

        with self._lock:
            # Bounded storage hygiene: prune stale keys if capacity reached
            if len(self._records) >= self._max_keys:
                self._prune_expired(now, window_seconds)

            timestamps = self._records.get(key, [])
            valid_timestamps = [t for t in timestamps if t > cutoff]

            if len(valid_timestamps) >= max_requests:
                # Update records with cleaned timestamps to discard expired entries
                self._records[key] = valid_timestamps
                # Oldest timestamp in current window determines wait time
                earliest = valid_timestamps[0]
                retry_after = max(1, int(math.ceil(window_seconds - (now - earliest))))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Rate limit exceeded for {endpoint_group}. "
                        f"Limit is {max_requests} requests per {window_seconds}s. "
                        f"Please retry after {retry_after} seconds."
                    ),
                    headers={"Retry-After": str(retry_after)}
                )

            valid_timestamps.append(now)
            self._records[key] = valid_timestamps

    def _prune_expired(self, now: float, window_seconds: int = 60) -> None:
        """
        Internal cleanup called under self._lock.
        First removes entries with no timestamps or whose newest timestamp is older than max(300, window_seconds).
        If the collection remains at or above _max_keys, enforces hard bounded capacity by evicting
        least-recently-active keys down to 80% capacity.
        """
        expiry_threshold = max(300.0, float(window_seconds))
        stale_keys = [
            k for k, ts in self._records.items()
            if not ts or (now - ts[-1]) > expiry_threshold
        ]
        for k in stale_keys:
            self._records.pop(k, None)

        # Enforce hard upper bound if still at or above capacity
        if len(self._records) >= self._max_keys:
            sorted_keys = sorted(
                self._records.keys(),
                key=lambda k: self._records[k][-1] if self._records[k] else 0.0
            )
            target_size = int(self._max_keys * 0.8)
            evict_count = len(self._records) - target_size
            for k in sorted_keys[:evict_count]:
                self._records.pop(k, None)

    def reset(self) -> None:
        """Clears all records. Useful for testing."""
        with self._lock:
            self._records.clear()

    @property
    def key_count(self) -> int:
        """Thread-safe count of tracked client-endpoint keys."""
        with self._lock:
            return len(self._records)

# Global singleton rate limiter instance
limiter = SlidingWindowRateLimiter()
