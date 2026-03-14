namespace WindowsTtsHelper.Contracts;

public sealed record HealthResponse(
    string Status,
    string Version,
    string Backend,
    int VoiceCount
);
