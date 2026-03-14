namespace WindowsTtsHelper.Contracts;

public sealed record VoiceResponse(
    string Id,
    string DisplayName,
    string Locale,
    string Gender,
    bool IsDefault
);
