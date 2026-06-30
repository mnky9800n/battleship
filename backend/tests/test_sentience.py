"""Sentience client tests with a mocked httpx, no network."""

import asyncio

from app import sentience


class _Resp:
    def __init__(self, data):
        self._d = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._d


def _client(get_data=None, raises=False):
    class Fake:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, *a, **k):
            if raises:
                raise RuntimeError("boom")
            return _Resp(get_data)

        async def post(self, *a, **k):
            return _Resp({"ok": True})

    return Fake


def test_summarize_flattens_notes(monkeypatch):
    monkeypatch.setattr(sentience.httpx, "AsyncClient",
                        _client(get_data=[{"content": "I journal about discipline every morning"}]))
    out = asyncio.run(sentience.summarize("key"))
    assert out and "discipline" in out


def test_summarize_handles_dict_envelope(monkeypatch):
    monkeypatch.setattr(sentience.httpx, "AsyncClient",
                        _client(get_data={"memories": [{"content": "hates losing"}]}))
    assert "hates losing" in asyncio.run(sentience.summarize("key"))


def test_summarize_returns_none_on_error(monkeypatch):
    monkeypatch.setattr(sentience.httpx, "AsyncClient", _client(raises=True))
    assert asyncio.run(sentience.summarize("key")) is None
