from dataclasses import dataclass


@dataclass(frozen=True)
class ServiceConfig:
    backend: str = "kokoro"
    host: str = "0.0.0.0"
    port: int = 43115
    version: str = "0.1.0"


DEFAULT_CONFIG = ServiceConfig()
