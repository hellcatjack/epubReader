using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using WindowsTtsHelper.Contracts;
using WindowsTtsHelper.Services;
using Xunit;

namespace WindowsTtsHelper.Tests;

public class VoicesEndpointTests
{
    [Fact]
    public async Task GetVoices_ReturnsNormalizedVoices()
    {
        await using var application = new TestApplicationFactory(services =>
        {
            services.AddSingleton<IWindowsVoiceService>(new FakeWindowsVoiceService([
                new VoiceResponse("voice-1", "Microsoft Aria", "en-US", "female", true),
            ]));
        });
        using var client = application.CreateClient();

        var voices = await client.GetFromJsonAsync<List<VoiceResponse>>("/voices");

        Assert.NotNull(voices);
        Assert.Single(voices!);
        Assert.Equal("voice-1", voices[0].Id);
    }

    private sealed class FakeWindowsVoiceService(IReadOnlyList<VoiceResponse> voices) : IWindowsVoiceService
    {
        public Task<IReadOnlyList<VoiceResponse>> GetVoicesAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult(voices);
        }
    }
}
