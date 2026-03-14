using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using WindowsTtsHelper.Contracts;
using WindowsTtsHelper.Services;
using Xunit;

namespace WindowsTtsHelper.Tests;

public class SpeakEndpointTests
{
    [Fact]
    public async Task PostSpeak_ReturnsWaveAudio()
    {
        await using var application = new TestApplicationFactory(services =>
        {
            services.AddSingleton<IWindowsSpeechSynthesisService>(new FakeWindowsSpeechSynthesisService([1, 2, 3]));
        });
        using var client = application.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/speak",
            new SpeakRequest("Hello world", "voice-1", 1.0, 1.0, "wav")
        );

        response.EnsureSuccessStatusCode();
        Assert.Equal("audio/wav", response.Content.Headers.ContentType?.MediaType);
        var payload = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal([1, 2, 3], payload);
    }

    private sealed class FakeWindowsSpeechSynthesisService(byte[] audio) : IWindowsSpeechSynthesisService
    {
        public Task<byte[]> SynthesizeAsync(SpeakRequest request, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(audio);
        }
    }
}
