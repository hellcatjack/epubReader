from unittest.mock import MagicMock
from unittest.mock import patch

from tts.qwen3_tts_service.qwen_runtime import QwenRuntime
from tts.qwen3_tts_service.voices import VOICE_CATALOG


def test_qwen_runtime_does_not_load_model_on_construction():
    loader = MagicMock()

    runtime = QwenRuntime(model=None, model_loader=loader, voice_catalog=VOICE_CATALOG)

    assert runtime.get_status() == "warming_up"
    loader.assert_not_called()


def test_qwen_runtime_maps_speaker_and_language():
    fake_model = MagicMock()
    fake_model.generate_custom_voice.return_value = ([[0.0, 0.1, 0.0]], 24000)

    loader = MagicMock(return_value=fake_model)
    runtime = QwenRuntime(model=None, model_loader=loader, voice_catalog=VOICE_CATALOG)

    audio = runtime.synthesize("Hello there", "Ryan", rate=1.0, volume=1.0)

    assert audio.startswith(b"RIFF")
    loader.assert_called_once()
    fake_model.generate_custom_voice.assert_called_once_with(
        text="Hello there",
        language="English",
        speaker="Ryan",
        instruct="",
    )


def test_qwen_runtime_prefers_gpu_when_rocm_is_available():
    with patch("tts.qwen3_tts_service.qwen_runtime._gpu_available", return_value=True):
        loader = QwenRuntime.build_model_loader()

    qwen_module = MagicMock()
    with patch.dict("sys.modules", {"qwen_tts": qwen_module}):
        loader()

    qwen_module.Qwen3TTSModel.from_pretrained.assert_called_once_with(
        "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
        device_map="cuda:0",
    )
