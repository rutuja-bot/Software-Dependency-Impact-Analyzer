import time
import threading
import pytest
from unittest.mock import patch, MagicMock
from fastapi import Request, HTTPException

from app.core.rate_limiter import SlidingWindowRateLimiter
from app.core.config import settings

def make_dummy_request(ip: str = "192.168.1.100", forwarded_for: str = None) -> Request:
    req = MagicMock(spec=Request)
    headers = {}
    if forwarded_for:
        headers["X-Forwarded-For"] = forwarded_for
    req.headers = headers
    req.client = MagicMock()
    req.client.host = ip
    return req

def test_rate_limiter_allows_up_to_limit_and_blocks_excess():
    limiter = SlidingWindowRateLimiter(max_keys=100)
    req = make_dummy_request("10.0.0.1")

    # Limit: 3 requests per 60s
    limiter.check_rate_limit(req, endpoint_group="test", max_requests=3, window_seconds=60)
    limiter.check_rate_limit(req, endpoint_group="test", max_requests=3, window_seconds=60)
    limiter.check_rate_limit(req, endpoint_group="test", max_requests=3, window_seconds=60)

    # 4th request must be rejected with 429
    with pytest.raises(HTTPException) as exc_info:
        limiter.check_rate_limit(req, endpoint_group="test", max_requests=3, window_seconds=60)

    assert exc_info.value.status_code == 429
    assert "Rate limit exceeded" in exc_info.value.detail
    assert "Retry-After" in exc_info.value.headers
    retry_after = int(exc_info.value.headers["Retry-After"])
    assert 1 <= retry_after <= 60

def test_rate_limiter_sliding_window_expiration():
    limiter = SlidingWindowRateLimiter(max_keys=100)
    req = make_dummy_request("10.0.0.2")

    # Inject timestamps in the past
    now = time.monotonic()
    key = ("10.0.0.2", "expire_test")
    # 2 requests from 70 seconds ago (outside a 60s window)
    limiter._records[key] = [now - 75.0, now - 70.0]

    # Limit 2 per 60s: since past requests expired, new request should succeed
    limiter.check_rate_limit(req, endpoint_group="expire_test", max_requests=2, window_seconds=60)
    assert len(limiter._records[key]) == 1

def test_rate_limiter_thread_safety():
    limiter = SlidingWindowRateLimiter(max_keys=5000)
    req = make_dummy_request("10.0.0.3")

    success_count = 0
    blocked_count = 0
    lock = threading.Lock()

    def hit_limiter():
        nonlocal success_count, blocked_count
        try:
            limiter.check_rate_limit(req, endpoint_group="concurrent", max_requests=25, window_seconds=60)
            with lock:
                success_count += 1
        except HTTPException as exc:
            if exc.status_code == 429:
                with lock:
                    blocked_count += 1

    threads = [threading.Thread(target=hit_limiter) for _ in range(50)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert success_count == 25
    assert blocked_count == 25
    assert len(limiter._records[("10.0.0.3", "concurrent")]) == 25

def test_rate_limiter_memory_bounds_and_eviction():
    # Capacity set to 10 keys
    limiter = SlidingWindowRateLimiter(max_keys=10)

    # Fill up to 15 different client IPs
    for i in range(15):
        req = make_dummy_request(f"192.168.1.{i}")
        limiter.check_rate_limit(req, endpoint_group="flood", max_requests=5, window_seconds=60)

    # Records count must never exceed max_keys
    assert limiter.key_count <= 10

def test_rate_limiter_extract_client_ip_proxy_trust():
    limiter = SlidingWindowRateLimiter()
    req = make_dummy_request(ip="172.16.0.1", forwarded_for="203.0.113.195, 70.41.3.18")

    # Untrusted proxy (default) -> TCP remote address
    with patch.object(settings, "TRUST_PROXY_HEADERS", False):
        assert limiter.extract_client_ip(req) == "172.16.0.1"

    # Trusted proxy -> First IP from X-Forwarded-For
    with patch.object(settings, "TRUST_PROXY_HEADERS", True):
        assert limiter.extract_client_ip(req) == "203.0.113.195"

def test_rate_limiter_disabled_bypass():
    limiter = SlidingWindowRateLimiter()
    req = make_dummy_request("10.0.0.4")

    with patch.object(settings, "RATE_LIMIT_ENABLED", False):
        # Should allow 50 requests even when limit is 2
        for _ in range(50):
            limiter.check_rate_limit(req, endpoint_group="bypass", max_requests=2, window_seconds=60)
        assert limiter.key_count == 0
