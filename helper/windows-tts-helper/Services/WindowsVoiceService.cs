using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;
using WindowsTtsHelper.Contracts;

namespace WindowsTtsHelper.Services;

public sealed class WindowsVoiceService : IWindowsVoiceService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<IReadOnlyList<VoiceResponse>> GetVoicesAsync(CancellationToken cancellationToken = default)
    {
        if (!OperatingSystem.IsWindows())
        {
            return [];
        }

        var output = await RunPowerShellAsync(
            """
            Add-Type -AssemblyName System.Speech
            $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
            try {
              $voices = $synth.GetInstalledVoices() | ForEach-Object {
                $voiceInfo = $_.VoiceInfo
                [PSCustomObject]@{
                  id = $voiceInfo.Name
                  displayName = if ($voiceInfo.Description) { $voiceInfo.Description } else { $voiceInfo.Name }
                  locale = $voiceInfo.Culture.Name
                  gender = $voiceInfo.Gender.ToString().ToLowerInvariant()
                }
              }
              $voices | ConvertTo-Json -Compress
            } finally {
              $synth.Dispose()
            }
            """,
            cancellationToken
        );

        if (string.IsNullOrWhiteSpace(output))
        {
            return [];
        }

        var records = JsonSerializer.Deserialize<List<VoiceShellRecord>>(output, JsonOptions) ?? [];
        return records
            .Where(record => !string.IsNullOrWhiteSpace(record.Id))
            .Select((record, index) => new VoiceResponse(
                record.Id!,
                string.IsNullOrWhiteSpace(record.DisplayName) ? record.Id! : record.DisplayName!,
                string.IsNullOrWhiteSpace(record.Locale) ? "unknown" : record.Locale!,
                string.IsNullOrWhiteSpace(record.Gender) ? "unknown" : record.Gender!,
                index == 0
            ))
            .ToList();
    }

    private static async Task<string> RunPowerShellAsync(string script, CancellationToken cancellationToken)
    {
        var candidates = OperatingSystem.IsWindows()
            ? new[] { "powershell.exe", "pwsh.exe" }
            : Array.Empty<string>();

        foreach (var candidate in candidates)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = candidate,
                    Arguments = $"-NoProfile -NonInteractive -Command \"{EscapeForPowerShell(script)}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };

                using var process = Process.Start(startInfo);
                if (process is null)
                {
                    continue;
                }

                var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
                var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);

                await process.WaitForExitAsync(cancellationToken);
                var stdout = await stdoutTask;
                var stderr = await stderrTask;

                if (process.ExitCode == 0)
                {
                    return stdout.Trim();
                }

                throw new InvalidOperationException(
                    string.IsNullOrWhiteSpace(stderr)
                        ? $"PowerShell exited with code {process.ExitCode}."
                        : stderr.Trim()
                );
            }
            catch (Win32Exception)
            {
                continue;
            }
        }

        return string.Empty;
    }

    private static string EscapeForPowerShell(string script)
    {
        return script.Replace("\"", "`\"");
    }

    private sealed record VoiceShellRecord(
        string? Id,
        string? DisplayName,
        string? Locale,
        string? Gender
    );
}
