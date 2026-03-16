from .schemas import VoiceResponse


VOICE_CATALOG = [
    VoiceResponse(
        id="Ryan",
        displayName="Ryan",
        locale="en-US",
        gender="male",
        isDefault=True,
    ),
    VoiceResponse(
        id="Aiden",
        displayName="Aiden",
        locale="en-US",
        gender="male",
        isDefault=False,
    ),
]
