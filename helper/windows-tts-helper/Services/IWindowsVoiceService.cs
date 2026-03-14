using WindowsTtsHelper.Contracts;

namespace WindowsTtsHelper.Services;

public interface IWindowsVoiceService
{
    Task<IReadOnlyList<VoiceResponse>> GetVoicesAsync(CancellationToken cancellationToken = default);
}
