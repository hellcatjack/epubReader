from dataclasses import dataclass, field
from threading import Lock
from typing import Any, Callable, Sequence

from .config import DEFAULT_CONFIG
from .runtime import BaseTtsRuntime, encode_wav_bytes
from .voices import VOICE_CATALOG


def infer_language(text: str) -> str:
    stripped = text.strip()
    if not stripped:
        return "Auto"

    ascii_letters = sum(character.isascii() and character.isalpha() for character in stripped)
    cjk_characters = sum("\u4e00" <= character <= "\u9fff" for character in stripped)

    if cjk_characters > ascii_letters:
        return "Chinese"
    if ascii_letters:
        return "English"
    return "Auto"


@dataclass
class QwenRuntime(BaseTtsRuntime):
    model: Any | None = None
    model_loader: Callable[[], Any] | None = None
    voice_catalog: list = None  # type: ignore[assignment]
    _model_lock: Lock = field(default_factory=Lock, repr=False)

    def __post_init__(self):
        if self.voice_catalog is None:
            self.voice_catalog = VOICE_CATALOG.copy()
        self.voices = self.voice_catalog
        self.warming_up = self.model is None

    @classmethod
    def from_pretrained(cls):
        return cls(
            model=None,
            model_loader=cls.build_model_loader(),
            voice_catalog=VOICE_CATALOG.copy(),
        )

    @staticmethod
    def build_model_loader():
        device_map = "cuda:0" if _gpu_available() else "cpu"

        def load_model():
            from qwen_tts import Qwen3TTSModel

            return Qwen3TTSModel.from_pretrained(
                DEFAULT_CONFIG.model_id,
                device_map=device_map,
            )

        return load_model

    def get_status(self) -> str:
        return "ok" if self.model is not None else "warming_up"

    def synthesize(self, text: str, voice_id: str, rate: float, volume: float) -> bytes:
        del rate
        model = self._ensure_model_loaded()

        wavs, sample_rate = model.generate_custom_voice(
            text=text,
            language=infer_language(text),
            speaker=voice_id,
            instruct="",
        )
        samples = _normalize_samples(wavs)
        return encode_wav_bytes(samples, sample_rate=sample_rate, volume=volume)

    def _ensure_model_loaded(self):
        if self.model is not None:
            return self.model

        if self.model_loader is None:
            raise RuntimeError("Qwen3-TTS model loader is not configured.")

        with self._model_lock:
            if self.model is None:
                self.model = self.model_loader()
                self.warming_up = False

        return self.model


def _normalize_samples(wavs: Any) -> Sequence[float]:
    if isinstance(wavs, (list, tuple)) and wavs:
        first_item = wavs[0]
        if isinstance(first_item, (list, tuple)):
            return [float(sample) for sample in first_item]
        try:
            return [float(sample) for sample in first_item.tolist()]
        except AttributeError:
            return [float(sample) for sample in wavs]

    try:
        return [float(sample) for sample in wavs.tolist()]
    except AttributeError:
        return [float(sample) for sample in wavs]


def _gpu_available() -> bool:
    try:
        import torch
    except ModuleNotFoundError:
        return False

    return bool(torch.cuda.is_available())
