using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using WindowsTtsHelper.Contracts;
using Xunit;

namespace WindowsTtsHelper.Tests;

public class HealthEndpointTests
{
    [Fact]
    public async Task GetHealth_ReturnsOkStatus()
    {
        await using var application = new WebApplicationFactory<Program>();
        using var client = application.CreateClient();

        var response = await client.GetFromJsonAsync<HealthResponse>("/health");

        Assert.NotNull(response);
        Assert.Equal("ok", response!.Status);
        Assert.Equal("windows-native", response.Backend);
    }

    [Fact]
    public async Task OptionsSpeak_AllowsPrivateOriginCorsRequests()
    {
        await using var application = new TestApplicationFactory();
        using var client = application.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/speak");
        request.Headers.Add("Origin", "http://192.168.1.31:5173");
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type");

        using var response = await client.SendAsync(request);

        Assert.True(response.IsSuccessStatusCode);
        Assert.Equal("http://192.168.1.31:5173", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }
}
