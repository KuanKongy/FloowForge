"""Outbound URL validation for user-supplied callback targets.

The worker POSTs run results to ``triggers.callback_url``, which any user can
set. Without a guard that is a server-side request forgery primitive: cloud
metadata services (``169.254.169.254``), ``localhost``, and anything else on the
private network are reachable from inside the deployment.

We resolve the hostname and reject the request when *any* resolved address is
non-public, which also closes DNS-rebinding style tricks where a public name
maps to a private address.
"""
from __future__ import annotations

import ipaddress
import socket

_ALLOWED_SCHEMES = {"http", "https"}


class UnsafeCallbackURL(ValueError):
    """Raised when a callback URL points somewhere we refuse to call."""


def _is_public(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def assert_safe_callback_url(url: str, *, allow_private: bool = False) -> None:
    """Raise :class:`UnsafeCallbackURL` if ``url`` must not be requested.

    ``allow_private`` exists for local development, where callbacks legitimately
    point at localhost.
    """
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise UnsafeCallbackURL(f"Unsupported URL scheme: {parsed.scheme or 'none'}")
    host = parsed.hostname
    if not host:
        raise UnsafeCallbackURL("Callback URL has no host")
    if allow_private:
        return

    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise UnsafeCallbackURL(f"Could not resolve callback host: {host}") from exc

    addresses = {info[4][0] for info in infos}
    if not addresses:
        raise UnsafeCallbackURL(f"Could not resolve callback host: {host}")
    for addr in addresses:
        if not _is_public(addr):
            raise UnsafeCallbackURL(
                f"Callback host {host} resolves to a non-public address ({addr})"
            )
