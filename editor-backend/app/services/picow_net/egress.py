"""Egress filtering for the emulated Pico W network bridge.

The bridge dials real hosts on behalf of emulated firmware, using the
destination IP/port straight out of the chip's TCP/UDP packets. Without a
filter that is a server-side request forgery primitive: firmware could reach
the cloud metadata endpoint (169.254.169.254), loopback services (including
this backend), and other hosts on the internal network.

By default we block all private, loopback, link-local, and other non-global
address space. Operators who genuinely need the emulator to reach an internal
host can opt back in with PICOW_NET_ALLOW_PRIVATE=1, or allow-list specific
CIDRs via PICOW_NET_ALLOW_CIDRS (comma-separated).
"""

import ipaddress
import logging
import os

logger = logging.getLogger(__name__)

_ALLOW_PRIVATE = os.environ.get("PICOW_NET_ALLOW_PRIVATE", "").lower() in (
    "1",
    "true",
    "yes",
)


def _parse_allow_cidrs() -> list[ipaddress.IPv4Network]:
    raw = os.environ.get("PICOW_NET_ALLOW_CIDRS", "")
    nets: list[ipaddress.IPv4Network] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            nets.append(ipaddress.ip_network(part, strict=False))
        except ValueError:
            logger.warning("[picow-egress] ignoring invalid CIDR %r", part)
    return nets


_ALLOW_CIDRS = _parse_allow_cidrs()


def _ip_from(dst: "bytes | str") -> "ipaddress.IPv4Address | None":
    try:
        if isinstance(dst, bytes):
            if len(dst) != 4:
                return None
            return ipaddress.IPv4Address(bytes(dst))
        return ipaddress.IPv4Address(dst)
    except (ValueError, ipaddress.AddressValueError):
        return None


def is_egress_allowed(dst: "bytes | str") -> bool:
    """True when emulated firmware may open a connection to ``dst``.

    ``dst`` is a 4-byte address (as carried in a packet) or a dotted-quad
    string. Unparseable inputs are denied.
    """
    ip = _ip_from(dst)
    if ip is None:
        return False

    for net in _ALLOW_CIDRS:
        if ip in net:
            return True

    if _ALLOW_PRIVATE:
        return True

    # Deny everything that isn't a normal, globally-routable address.
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return False
    return ip.is_global
