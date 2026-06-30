"""Thin client for the Sentience memory API (the player's optional opt-in).

Two endpoints only: read memories in a time range, write a note memory. We read
the player's recent memories to flavor the AI's taunts and write a one-line match
recap at game over. The player's key is never persisted; it lives only on the
in-memory game for its duration.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx

BASE = "https://api.sentience.com/v1"


async def read_memories(key: str, days: int = 30):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(
            f"{BASE}/memories",
            params={"start": start.isoformat().replace("+00:00", "Z"), "end": end.isoformat().replace("+00:00", "Z")},
            headers={"Authorization": f"Bearer {key}"},
        )
        r.raise_for_status()
        return r.json()


async def write_memory(key: str, content: str):
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(
            f"{BASE}/memories",
            json={"content": content},
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
        r.raise_for_status()
        return r.json()


async def summarize(key: str, days: int = 30, limit: int = 2000) -> str | None:
    """Read recent memories and flatten them to a text blob for taunt flavor.
    Returns None on any error or if empty (the brain then taunts generically)."""
    try:
        data = await read_memories(key, days)
    except Exception as e:
        print("sentience: read failed:", e)
        return None
    # Response shape isn't pinned in the docs, so be defensive.
    items = data if isinstance(data, list) else (data.get("memories") or data.get("data") or [])
    notes = []
    for m in items or []:
        notes.append(str(m.get("content", "")) if isinstance(m, dict) else str(m))
    text = "  ".join(n for n in notes if n).strip()
    return text[:limit] or None
