from pydantic import BaseModel


class HealthResponse(BaseModel):
    backend: str
    device: str
    status: str
    version: str
    voiceCount: int
    warmed: bool


class PrewarmResponse(BaseModel):
    status: str


class SpeakRequest(BaseModel):
    format: str
    rate: float
    text: str
    voiceId: str
    volume: float


class VoiceResponse(BaseModel):
    displayName: str
    gender: str
    id: str
    isDefault: bool
    locale: str
