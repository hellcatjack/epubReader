using System.ComponentModel;
using System.Diagnostics;
using System.Text;
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

        var encodedText = Convert.ToBase64String(Encoding.UTF8.GetBytes(request.Text));
        var encodedVoiceId = Convert.ToBase64String(Encoding.UTF8.GetBytes(request.VoiceId ?? string.Empty));
        var rate = Math.Clamp((int)Math.Round((request.Rate - 1d) * 10d), -10, 10);
        var volume = Math.Clamp((int)Math.Round(request.Volume * 100d), 0, 100);

        var script =
            $$"""
            Add-Type -AssemblyName System.Speech
            $text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{{encodedText}}'))
            $voiceId = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{{encodedVoiceId}}'))
            $memory = $null
            $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
            try {
              if ($voiceId -and $voiceId -ne 'system-default') {
                $synth.SelectVoice($voiceId)
              }
              $synth.Rate = {{rate}}
              $synth.Volume = {{volume}}
              $memory = New-Object System.IO.MemoryStream
              $synth.SetOutputToWaveStream($memory)
              $synth.Speak($text)
              $bytes = $memory.ToArray()
              $stdout = [Console]::OpenStandardOutput()
              $stdout.Write($bytes, 0, $bytes.Length)
              $stdout.Flush()
            } finally {
              if ($memory -ne $null) {
                $memory.Dispose()
              }
              $synth.Dispose()
            }
            """;

        return await RunPowerShellAudioAsync(script, cancellationToken);
    }

    private static async Task<byte[]> RunPowerShellAudioAsync(string script, CancellationToken cancellationToken)
    {
        foreach (var candidate in new[] { "powershell.exe", "pwsh.exe" })
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = candidate,
                    Arguments = $"-NoProfile -NonInteractive -EncodedCommand {EncodeForPowerShell(script)}",
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

                using var output = new MemoryStream();
                var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
                await process.StandardOutput.BaseStream.CopyToAsync(output, cancellationToken);
                await process.WaitForExitAsync(cancellationToken);
                var stderr = await stderrTask;

                if (process.ExitCode == 0)
                {
                    return output.ToArray();
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

        throw new InvalidOperationException("No supported PowerShell executable was found.");
    }

    private static string EncodeForPowerShell(string script)
    {
        return Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
    }
}
