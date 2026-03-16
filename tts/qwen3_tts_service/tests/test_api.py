from fastapi.testclient import TestClient

from tts.qwen3_tts_service.app import create_app


def test_health_reports_qwen_backend():
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["backend"] == "qwen3-tts"


def test_voices_returns_qwen_speakers():
    client = TestClient(create_app())

    response = client.get("/voices")
    payload = response.json()

    assert response.status_code == 200
    assert any(voice["id"] == "Ryan" for voice in payload)
