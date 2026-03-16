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


def test_speak_returns_wav_audio():
    client = TestClient(create_app())

    response = client.post(
        "/speak",
        json={
            "text": "Hello world",
            "voiceId": "Ryan",
            "rate": 1.0,
            "volume": 1.0,
            "format": "wav",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"


def test_speak_rejects_unknown_voice():
    client = TestClient(create_app())

    response = client.post(
        "/speak",
        json={
            "text": "Hello world",
            "voiceId": "unknown",
            "rate": 1.0,
            "volume": 1.0,
            "format": "wav",
        },
    )

    assert response.status_code == 400


def test_speak_supports_browser_cors_requests():
    client = TestClient(create_app())

    response = client.options(
        "/speak",
        headers={
            "Origin": "http://192.168.1.31:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
