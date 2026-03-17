from dataclasses import dataclass, field

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

    def prewarm(self):
        self.status = "ok"
        self.warmed = True
        if self.device == "uninitialized":
            self.device = "cpu"
