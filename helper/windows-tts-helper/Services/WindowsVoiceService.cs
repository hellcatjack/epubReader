using Windows.Media.SpeechSynthesis;
using WindowsTtsHelper.Contracts;

namespace WindowsTtsHelper.Services;

public sealed class WindowsVoiceService : IWindowsVoiceService
{
    public Task<IReadOnlyList<VoiceResponse>> GetVoicesAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!OperatingSystem.IsWindows())
        {
            return Task.FromResult<IReadOnlyList<VoiceResponse>>([]);
        }

        var defaultVoiceId = SpeechSynthesizer.DefaultVoice?.Id;
        var voices = SpeechSynthesizer.AllVoices
            .Select(voice => new VoiceResponse(
                voice.Id,
                string.IsNullOrWhiteSpace(voice.DisplayName) ? voice.Id : voice.DisplayName,
                string.IsNullOrWhiteSpace(voice.Language) ? "unknown" : voice.Language,
                voice.Gender.ToString().ToLowerInvariant(),
                string.Equals(voice.Id, defaultVoiceId, StringComparison.Ordinal)
            ))
            .ToList();

        return Task.FromResult<IReadOnlyList<VoiceResponse>>(voices);
    }
}
