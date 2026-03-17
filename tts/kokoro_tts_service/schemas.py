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


class VoiceResponse(BaseModel):
    displayName: str
    gender: str
    id: str
    isDefault: bool
    locale: str
