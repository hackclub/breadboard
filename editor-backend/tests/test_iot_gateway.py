"""Tests for ESP32 web-server gateway navigation."""
from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import iot_gateway
from app.services.gateway_tokens import clear_token, issue_token


class _FakeHttpClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def request(self, **_kwargs):
        return SimpleNamespace(
            content=b'joke page',
            status_code=200,
            headers={'content-type': 'text/plain'},
        )


def test_gateway_keeps_access_for_relative_links(monkeypatch) -> None:
    """The initial gwt URL must allow later relative ESP32 web routes."""
    client_id = 'test-session::esp32'
    token = issue_token(client_id)
    app = FastAPI()
    app.include_router(iot_gateway.router, prefix='/api/gateway')

    monkeypatch.setattr(
        iot_gateway.esp_lib_manager,
        'get_instance',
        lambda requested_id: SimpleNamespace(
            wifi_enabled=True,
            wifi_hostfwd_port=12345,
        ) if requested_id == client_id else None,
    )
    monkeypatch.setattr(iot_gateway.httpx, 'AsyncClient', lambda **_kwargs: _FakeHttpClient())

    try:
        with TestClient(app, base_url='https://testserver') as browser:
            first = browser.get(f'/api/gateway/{client_id}/?gwt={token}')
            assert first.status_code == 200
            assert 'HttpOnly' in first.headers['set-cookie']
            assert 'Path=/api/gateway/test-session::esp32/' in first.headers['set-cookie']

            # A browser resolves href="new" to this URL without the gwt query.
            next_page = browser.get(f'/api/gateway/{client_id}/new')
            assert next_page.status_code == 200
            assert next_page.text == 'joke page'
    finally:
        clear_token(client_id)
