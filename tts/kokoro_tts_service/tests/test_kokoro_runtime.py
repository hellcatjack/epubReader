from unittest.mock import MagicMock
from unittest.mock import patch

import numpy as np

from tts.kokoro_tts_service.kokoro_runtime import KokoroRuntime
from tts.kokoro_tts_service.voices import VOICE_CATALOG


def test_kokoro_runtime_prefers_cuda_when_available():
    with patch("tts.kokoro_tts_service.kokoro_runtime._gpu_available", return_value=True):
        runtime = KokoroRuntime(pipeline_loader=MagicMock(), voice_catalog=VOICE_CATALOG)

    assert runtime._resolve_device() == "cuda:0"


def test_prewarm_marks_runtime_as_warmed():
    fake_pipeline = MagicMock()
    fake_pipeline.return_value = iter([("Warmup", "W ER M AH P", np.array([0.0, 0.1], dtype=np.float32))])
    runtime = KokoroRuntime(pipeline_loader=lambda: fake_pipeline, voice_catalog=VOICE_CATALOG)

    runtime.prewarm()

    assert runtime.get_status()["warmed"] is True
    assert runtime.get_status()["status"] == "ok"


def test_synthesize_collects_generator_audio_into_single_wav():
    fake_pipeline = MagicMock()
    fake_pipeline.return_value = iter(
        [
            ("First", "F ER S T", np.array([0.0, 0.1], dtype=np.float32)),
            ("Second", "S EH K AH N D", np.array([0.2, 0.3], dtype=np.float32)),
        ]
    )
    runtime = KokoroRuntime(pipeline_loader=lambda: fake_pipeline, voice_catalog=VOICE_CATALOG)

    audio = runtime.synthesize("First Second", "af_heart", rate=1.0, volume=1.0)

    assert audio.startswith(b"RIFF")
