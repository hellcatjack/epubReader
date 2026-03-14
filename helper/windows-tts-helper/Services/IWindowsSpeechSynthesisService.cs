using WindowsTtsHelper.Contracts;

namespace WindowsTtsHelper.Services;

public interface IWindowsSpeechSynthesisService
{
    Task<byte[]> SynthesizeAsync(SpeakRequest request, CancellationToken cancellationToken = default);
}
