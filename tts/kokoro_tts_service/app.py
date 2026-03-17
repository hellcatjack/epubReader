from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import DEFAULT_CONFIG, ServiceConfig
from .runtime import BaseKokoroRuntime
from .schemas import HealthResponse, PrewarmResponse, VoiceResponse


def create_app(runtime: BaseKokoroRuntime | None = None, config: ServiceConfig = DEFAULT_CONFIG):
    app = FastAPI(title="Kokoro TTS Service", version=config.version)
    service_runtime = runtime or BaseKokoroRuntime()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", response_model=HealthResponse)
    def health():
        status = service_runtime.get_status()
        return HealthResponse(
            backend=config.backend,
            device=status["device"],
            status=status["status"],
            version=config.version,
            voiceCount=len(service_runtime.list_voices()),
            warmed=status["warmed"],
        )

    @app.get("/voices", response_model=list[VoiceResponse])
    def voices():
        return service_runtime.list_voices()

    @app.post("/prewarm", response_model=PrewarmResponse)
    def prewarm():
        service_runtime.prewarm()
        return PrewarmResponse(status="ok")

    return app
