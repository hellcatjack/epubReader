from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import DEFAULT_CONFIG, ServiceConfig
from .runtime import BaseTtsRuntime
from .schemas import HealthResponse, SpeakRequest


def create_app(runtime: BaseTtsRuntime | None = None, config: ServiceConfig = DEFAULT_CONFIG):
    app = FastAPI(title="Qwen3-TTS Service", version=config.version)
    service_runtime = runtime or BaseTtsRuntime()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

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

    @app.post("/speak")
    def speak(request: SpeakRequest):
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="text is required")

        if request.format.lower() != "wav":
            raise HTTPException(status_code=400, detail="only wav format is supported")

        if not service_runtime.has_voice(request.voiceId):
            raise HTTPException(status_code=400, detail="unsupported voiceId")

        audio = service_runtime.synthesize(
            text=request.text,
            voice_id=request.voiceId,
            rate=request.rate,
            volume=request.volume,
        )
        return Response(content=audio, media_type="audio/wav")

    return app
