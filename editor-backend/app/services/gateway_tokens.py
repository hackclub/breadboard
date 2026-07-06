"""Per-session capability tokens for the IoT gateway.

The gateway proxies HTTP to an ESP32 instance chosen solely by the `client_id`
in the URL. Since nothing binds the caller to the instance they created, a
leaked `client_id` would let a third party reach someone else's running ESP32
web server. We mint a high-entropy token when a simulation WebSocket connects,
hand it to that socket (and only that socket), and require it on gateway
requests. Only the client that opened the session learns the token.
"""

import secrets

# client_id -> token. Lives for the life of the WS connection.
_tokens: dict[str, str] = {}


def issue_token(client_id: str) -> str:
    token = secrets.token_urlsafe(24)
    _tokens[client_id] = token
    return token


def verify_token(client_id: str, token: "str | None") -> bool:
    expected = _tokens.get(client_id)
    if not expected or not token:
        return False
    return secrets.compare_digest(expected, token)


def clear_token(client_id: str) -> None:
    _tokens.pop(client_id, None)
