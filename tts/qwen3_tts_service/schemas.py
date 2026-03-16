from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    version: str
    backend: str
    voiceCount: int


class VoiceResponse(BaseModel):
    id: str
    displayName: str
    locale: str
    gender: str
    isDefault: bool
