namespace WindowsTtsHelper.Contracts;

public sealed record SpeakRequest(
    string Text,
    string VoiceId,
    double Rate,
    double Volume,
    string Format
);
