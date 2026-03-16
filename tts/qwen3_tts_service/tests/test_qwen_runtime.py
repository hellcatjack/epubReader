from unittest.mock import MagicMock

from tts.qwen3_tts_service.qwen_runtime import QwenRuntime
from tts.qwen3_tts_service.voices import VOICE_CATALOG


def test_qwen_runtime_maps_speaker_and_language():
    fake_model = MagicMock()
    fake_model.generate_custom_voice.return_value = ([[0.0, 0.1, 0.0]], 24000)

    runtime = QwenRuntime(model=fake_model, voice_catalog=VOICE_CATALOG)

    audio = runtime.synthesize("Hello there", "Ryan", rate=1.0, volume=1.0)

    assert audio.startswith(b"RIFF")
    fake_model.generate_custom_voice.assert_called_once_with(
        text="Hello there",
        language="English",
        speaker="Ryan",
        instruct="",
    )
