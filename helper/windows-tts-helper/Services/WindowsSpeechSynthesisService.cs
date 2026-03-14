using Windows.Media.SpeechSynthesis;
using WindowsTtsHelper.Contracts;

namespace WindowsTtsHelper.Services;

public sealed class WindowsSpeechSynthesisService : IWindowsSpeechSynthesisService
{
    public async Task<byte[]> SynthesizeAsync(SpeakRequest request, CancellationToken cancellationToken = default)
    {
        if (!string.Equals(request.Format, "wav", StringComparison.OrdinalIgnoreCase))
        {
            throw new NotSupportedException("Only wav output is supported.");
        }

        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Windows local speech synthesis is only available on Windows.");
        }

        using var synthesizer = new SpeechSynthesizer();
        var selectedVoice = ResolveVoice(request.VoiceId);
        if (selectedVoice is not null)
        {
            synthesizer.Voice = selectedVoice;
        }

        synthesizer.Options.AudioVolume = Math.Clamp(request.Volume, 0d, 1d);
        synthesizer.Options.SpeakingRate = request.Rate > 0d ? request.Rate : 1d;

        using var stream = await synthesizer.SynthesizeTextToStreamAsync(request.Text).AsTask(cancellationToken);
        return await ReadAllBytesAsync(stream, cancellationToken);
    }

    private static VoiceInformation? ResolveVoice(string? voiceId)
    {
        if (string.IsNullOrWhiteSpace(voiceId) || string.Equals(voiceId, "system-default", StringComparison.Ordinal))
        {
            return null;
        }

        return SpeechSynthesizer.AllVoices.FirstOrDefault(voice =>
            string.Equals(voice.Id, voiceId, StringComparison.Ordinal) ||
            string.Equals(voice.DisplayName, voiceId, StringComparison.OrdinalIgnoreCase)
        );
    }

    private static async Task<byte[]> ReadAllBytesAsync(SpeechSynthesisStream stream, CancellationToken cancellationToken)
    {
        var size = checked((int)stream.Size);
        if (size == 0)
        {
            return [];
        }

        var bytes = new byte[size];
        using var input = stream.GetInputStreamAt(0);
        using var reader = new Windows.Storage.Streams.DataReader(input);
        await reader.LoadAsync((uint)size).AsTask(cancellationToken);
        reader.ReadBytes(bytes);
        return bytes;
    }
}
