from dataclasses import dataclass
from typing import Any, Sequence

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
    voice_catalog: list = None  # type: ignore[assignment]

    def __post_init__(self):
        if self.voice_catalog is None:
            self.voice_catalog = VOICE_CATALOG.copy()
        self.voices = self.voice_catalog

    @classmethod
    def from_pretrained(cls):
        from qwen_tts import Qwen3TTSModel

        model = Qwen3TTSModel.from_pretrained(DEFAULT_CONFIG.model_id)
        return cls(model=model, voice_catalog=VOICE_CATALOG.copy())

    def synthesize(self, text: str, voice_id: str, rate: float, volume: float) -> bytes:
        if self.model is None:
            raise RuntimeError("Qwen3-TTS model is not loaded.")

        wavs, sample_rate = self.model.generate_custom_voice(
            text=text,
            language=infer_language(text),
            speaker=voice_id,
            instruct="",
        )
        samples = _normalize_samples(wavs)
        return encode_wav_bytes(samples, sample_rate=sample_rate, volume=volume)


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
