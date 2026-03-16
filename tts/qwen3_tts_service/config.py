from dataclasses import dataclass


@dataclass(frozen=True)
class ServiceConfig:
    backend: str = "qwen3-tts"
    host: str = "0.0.0.0"
    model_id: str = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"
    port: int = 43115
    version: str = "0.1.0"


DEFAULT_CONFIG = ServiceConfig()
