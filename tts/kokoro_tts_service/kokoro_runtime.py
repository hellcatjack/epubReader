from dataclasses import dataclass
from threading import Lock
from typing import Any, Callable

import numpy as np

from .runtime import BaseKokoroRuntime, _encode_wav_bytes
from .voices import VOICE_CATALOG


@dataclass
class KokoroRuntime(BaseKokoroRuntime):
    pipeline: Any | None = None
    pipeline_loader: Callable[[], Any] | None = None
    voice_catalog: list | None = None

    def __post_init__(self):
        self.voices = self.voice_catalog or VOICE_CATALOG.copy()
        self.device = self._resolve_device()
        self.status = "warming_up"
        self.warmed = False
        self._pipeline_lock = Lock()

    @classmethod
    def from_environment(cls):
        return cls(
            pipeline_loader=cls.build_pipeline_loader(),
            voice_catalog=VOICE_CATALOG.copy(),
        )

    @staticmethod
    def build_pipeline_loader():
        device = "cuda:0" if _gpu_available() else "cpu"

        def load_pipeline():
            from kokoro import KPipeline

            return KPipeline(lang_code="a", device=device)

        return load_pipeline

    def _resolve_device(self):
        if self.device and self.device != "uninitialized":
            return self.device
        return "cuda:0" if _gpu_available() else "cpu"

    def _ensure_pipeline_loaded(self):
        if self.pipeline is not None:
            return self.pipeline

        if self.pipeline_loader is None:
            raise RuntimeError("Kokoro pipeline loader is not configured.")

        with self._pipeline_lock:
            if self.pipeline is None:
                self.pipeline = self.pipeline_loader()

        return self.pipeline

    def prewarm(self):
        self.synthesize("Warm up.", self.voices[0]["id"], rate=1.0, volume=0.1)

    def synthesize(self, text: str, voice_id: str, rate: float, volume: float) -> bytes:
        pipeline = self._ensure_pipeline_loaded()
        generator = pipeline(text=text, voice=voice_id, speed=rate)
        segments = [np.asarray(audio, dtype=np.float32) for _gs, _ps, audio in generator]
        if not segments:
            raise RuntimeError("Kokoro did not return audio.")

        self.status = "ok"
        self.warmed = True
        samples = np.concatenate(segments)
        return _encode_wav_bytes(samples, sample_rate=24000, volume=volume)


def _gpu_available() -> bool:
    try:
        import torch
    except ModuleNotFoundError:
        return False

    return bool(torch.cuda.is_available())
