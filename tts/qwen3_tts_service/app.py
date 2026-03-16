from fastapi import FastAPI

from .config import DEFAULT_CONFIG, ServiceConfig
from .runtime import BaseTtsRuntime
from .schemas import HealthResponse


def create_app(runtime: BaseTtsRuntime | None = None, config: ServiceConfig = DEFAULT_CONFIG):
    app = FastAPI(title="Qwen3-TTS Service", version=config.version)
    service_runtime = runtime or BaseTtsRuntime()

    @app.get("/health", response_model=HealthResponse)
    def health():
        return HealthResponse(
            status=service_runtime.get_status(),
            version=config.version,
            backend=config.backend,
            voiceCount=len(service_runtime.list_voices()),
        )

    @app.get("/voices")
    def voices():
        return service_runtime.list_voices()

    return app
