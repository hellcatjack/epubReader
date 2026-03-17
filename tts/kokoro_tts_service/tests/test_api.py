def test_health_reports_kokoro_backend(client):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["backend"] == "kokoro"
    assert "warmed" in payload
    assert "device" in payload


def test_voices_returns_curated_english_voices(client):
    response = client.get("/voices")
    payload = response.json()
    assert response.status_code == 200
    assert [voice["id"] for voice in payload] == ["af_heart", "af_bella", "am_adam", "am_michael"]


def test_prewarm_reports_success(client):
    response = client.post("/prewarm")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_speak_returns_wav_audio(client):
    response = client.post(
        "/speak",
        json={
            "text": "Hello world",
            "voiceId": "af_heart",
            "rate": 1.0,
            "volume": 1.0,
            "format": "wav",
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"


def test_speak_rejects_unknown_voice(client):
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
