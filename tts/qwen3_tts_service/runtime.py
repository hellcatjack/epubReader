from dataclasses import dataclass, field

from .voices import VOICE_CATALOG


@dataclass
class BaseTtsRuntime:
    warming_up: bool = False
    voices: list = field(default_factory=lambda: VOICE_CATALOG.copy())

    def get_status(self) -> str:
        return "warming_up" if self.warming_up else "ok"

    def list_voices(self):
        return self.voices
