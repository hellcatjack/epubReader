from dataclasses import dataclass, field
from io import BytesIO
import math
import wave

from .voices import VOICE_CATALOG


@dataclass
class BaseKokoroRuntime:
    device: str = "uninitialized"
    status: str = "warming_up"
    voices: list[dict] = field(default_factory=lambda: VOICE_CATALOG.copy())
    warmed: bool = False

    def get_status(self):
        return {
            "device": self.device,
            "status": self.status,
            "warmed": self.warmed,
        }

    def list_voices(self):
        return self.voices

    def has_voice(self, voice_id: str) -> bool:
        return any(voice["id"] == voice_id for voice in self.voices)

    def prewarm(self):
        self.status = "ok"
        self.warmed = True
        if self.device == "uninitialized":
            self.device = "cpu"

    def synthesize(self, text: str, voice_id: str, rate: float, volume: float) -> bytes:
        del text, voice_id, rate
        sample_rate = 24000
        duration_seconds = 0.05
        frame_count = int(sample_rate * duration_seconds)
        samples = (
            math.sin((2 * math.pi * 440 * index) / sample_rate)
            for index in range(frame_count)
        )
        return _encode_wav_bytes(samples, sample_rate=sample_rate, volume=volume)


def _encode_wav_bytes(samples, sample_rate: int, volume: float) -> bytes:
    amplitude = max(0.0, min(1.0, volume))
    buffer = BytesIO()

    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for raw_sample in samples:
            clamped = max(-1.0, min(1.0, float(raw_sample)))
            sample = int(amplitude * 32767 * clamped)
            frames.extend(sample.to_bytes(2, byteorder="little", signed=True))
        wav_file.writeframes(bytes(frames))

    return buffer.getvalue()
