"""Authentication: bcrypt password hashing, session tokens, avatar assignment.

Security is intentionally minimal per the trial (no email, 2FA, refresh, etc.),
but passwords are bcrypt-hashed rather than stored in plaintext. Session tokens
are random and kept in memory; a restart simply requires re-login.
"""

from __future__ import annotations

import secrets

import bcrypt

# token -> username
_tokens: dict[str, str] = {}

# Hackers headshots shipped with the frontend (frontend/public/assets/headshots/).
# Stored as a bare filename; the client resolves it from its own assets.
HEADSHOTS = [
    "dade.png",
    "kate.jpg",
    "cerealkiller.jpg",
    "lordnikon.jpg",
    "phantom_phreak.jpg",
    "joey.png",
    "theplague.jpg",
]


# bcrypt only considers the first 72 bytes; truncate to stay within its limit.
def _pw_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_pw_bytes(password), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


def assign_avatar(username: str) -> str:
    # Deterministic from the username so a user keeps the same face.
    idx = sum(ord(c) for c in username) % len(HEADSHOTS)
    return HEADSHOTS[idx]


def create_token(username: str) -> str:
    token = secrets.token_urlsafe(24)
    _tokens[token] = username
    return token


def user_for_token(token: str | None) -> str | None:
    if not token:
        return None
    return _tokens.get(token)


def revoke(token: str) -> None:
    _tokens.pop(token, None)
