using System.Net;
using WindowsTtsHelper.Contracts;
using WindowsTtsHelper.Services;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://127.0.0.1:43115");
builder.Services.AddCors(options =>
{
    options.AddPolicy(
        "LocalOrigins",
        policy => policy
            .SetIsOriginAllowed(IsAllowedLocalOrigin)
            .AllowAnyHeader()
            .AllowAnyMethod()
    );
});
builder.Services.AddSingleton<IWindowsVoiceService, WindowsVoiceService>();
builder.Services.AddSingleton<IWindowsSpeechSynthesisService, WindowsSpeechSynthesisService>();

var app = builder.Build();

app.UseCors("LocalOrigins");

app.MapGet("/health", async (IWindowsVoiceService voices, CancellationToken cancellationToken) =>
{
    var availableVoices = await voices.GetVoicesAsync(cancellationToken);
    return Results.Ok(new HealthResponse("ok", "0.1.0", "windows-native", availableVoices.Count));
});

app.MapGet("/voices", async (IWindowsVoiceService voices, CancellationToken cancellationToken) =>
{
    return Results.Ok(await voices.GetVoicesAsync(cancellationToken));
});

app.MapPost("/speak", async (SpeakRequest request, IWindowsSpeechSynthesisService tts, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Text))
    {
        return Results.BadRequest(new { error = "text is required" });
    }

    if (!string.Equals(request.Format, "wav", StringComparison.OrdinalIgnoreCase))
    {
        return Results.BadRequest(new { error = "only wav format is supported" });
    }

    var audio = await tts.SynthesizeAsync(request, cancellationToken);
    return Results.File(audio, "audio/wav");
});

app.Run();

static bool IsAllowedLocalOrigin(string origin)
{
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
    {
        return false;
    }

    if (string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase))
    {
        return true;
    }

    if (!IPAddress.TryParse(uri.Host, out var address))
    {
        return false;
    }

    if (IPAddress.IsLoopback(address))
    {
        return true;
    }

    if (address.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork)
    {
        return false;
    }

    var bytes = address.GetAddressBytes();
    return bytes[0] == 10 ||
           (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) ||
           (bytes[0] == 192 && bytes[1] == 168);
}

public partial class Program;
