using System.Diagnostics;
using System.Net.Security;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

// A reverse TLS connection; no shell listener is opened on the television.
internal static class Program
{
    private static readonly SemaphoreSlim SendLock = new(1, 1);
    private static Process? terminal;
    private static int ttyDescriptor = -1;

    private sealed record Settings(string host, int port, string fingerprint, string token, string directory);
    [StructLayout(LayoutKind.Sequential)]
    private struct WindowSize { public ushort rows, cols, xpixel, ypixel; }
    [DllImport("libc", SetLastError = true)] private static extern uint getuid();
    [DllImport("libc", SetLastError = true)] private static extern uint geteuid();
    [DllImport("libc", SetLastError = true)] private static extern int open(string path, int flags);
    [DllImport("libc", SetLastError = true)] private static extern int close(int fd);
    [DllImport("libc", SetLastError = true)] private static extern int ioctl(int fd, uint request, ref WindowSize size);
    [DllImport("libc", SetLastError = true)] private static extern IntPtr signal(int number, IntPtr handler);

    private static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Length != 1 || getuid() != 0 || geteuid() != 0) throw new Exception("A verified root identity is required");
            var settings = JsonSerializer.Deserialize<Settings>(File.ReadAllText(args[0])) ?? throw new Exception("Missing settings");
            File.Delete(args[0]);
            var expected = Convert.FromHexString(settings.fingerprint);
            if (expected.Length != 32) throw new Exception("Invalid certificate pin");
            using var tcp = new TcpClient { NoDelay = true };
            await tcp.ConnectAsync(settings.host, settings.port).WaitAsync(TimeSpan.FromSeconds(15));
            using var stream = new SslStream(tcp.GetStream(), false, (_, cert, _, _) => cert != null && CryptographicOperations.FixedTimeEquals(SHA256.HashData(cert.GetRawCertData()), expected));
            await stream.AuthenticateAsClientAsync(new SslClientAuthenticationOptions { TargetHost = "frame-terminal", EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13 }).WaitAsync(TimeSpan.FromSeconds(15));
            await Send(stream, new { type = "auth", token = settings.token, uid = getuid(), euid = geteuid() });
            var start = await Read(stream).WaitAsync(TimeSpan.FromSeconds(10));
            if (start.GetProperty("type").GetString() != "start") throw new Exception("Invalid start frame");
            var cols = start.GetProperty("cols").GetInt32(); var rows = start.GetProperty("rows").GetInt32();
            ValidateSize(cols, rows);
            var ttyFile = Path.Combine(settings.directory, "terminal.tty");
            var shell = "tty > " + Quote(ttyFile) + "; stty rows " + rows + " cols " + cols + "; exec /usr/bin/env -i HOME=/home/owner USER=root LOGNAME=root TERM=xterm-256color COLORTERM=truecolor PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PS1='TV root # ' /bin/bash --noprofile --norc -i";
            var info = new ProcessStartInfo("/usr/bin/script") { UseShellExecute = false, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (var argument in new[] { "-q", "-f", "-e", "-c", shell, "/dev/null" }) info.ArgumentList.Add(argument);
            info.Environment["TERM"] = "xterm-256color";
            // The noninteractive background bootstrap ignores INT/QUIT. Reset them
            // before spawning a terminal, or foreground commands inherit SIG_IGN.
            foreach (var number in new[] { 2, 3, 20, 21, 22 })
                if (signal(number, IntPtr.Zero) == new IntPtr(-1)) throw new Exception("Cannot restore terminal signal defaults");
            terminal = Process.Start(info) ?? throw new Exception("TV PTY did not start");
            for (var i = 0; !File.Exists(ttyFile) && i < 100 && !terminal.HasExited; i++) await Task.Delay(50);
            var tty = File.ReadAllText(ttyFile).Trim();
            if (!tty.StartsWith("/dev/pts/", StringComparison.Ordinal) || !int.TryParse(tty[9..], out _)) throw new Exception("Invalid PTY device");
            ttyDescriptor = open(tty, 2 | 0x100); // O_RDWR | O_NOCTTY
            if (ttyDescriptor < 0) throw new Exception("Cannot open TV PTY for resize");
            Resize(cols, rows);
            await Send(stream, new { type = "ready", uid = getuid(), euid = geteuid() });
            var output = Pump(terminal.StandardOutput.BaseStream, stream);
            var errors = Pump(terminal.StandardError.BaseStream, stream);
            var input = Input(stream);
            var exit = terminal.WaitForExitAsync();
            var completed = await Task.WhenAny(input, exit, output, errors);
            if (completed.IsFaulted) await completed;
            if (!terminal.HasExited) StopTerminal();
            await terminal.WaitForExitAsync();
            await Task.WhenAll(output, errors);
            await Send(stream, new { type = "exit", exitCode = terminal.ExitCode });
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error.GetType().Name + ": " + error.Message); return 1; }
        finally
        {
            StopTerminal();
            if (ttyDescriptor >= 0) close(ttyDescriptor);
            terminal?.Dispose();
        }
    }
    private static async Task Input(SslStream stream)
    {
        while (true)
        {
            var frame = await Read(stream);
            switch (frame.GetProperty("type").GetString())
            {
                case "input":
                    var bytes = Convert.FromBase64String(frame.GetProperty("data").GetString()!);
                    if (bytes.Length > 131072) throw new Exception("Input too large");
                    await terminal!.StandardInput.BaseStream.WriteAsync(bytes); await terminal.StandardInput.BaseStream.FlushAsync(); break;
                case "resize": Resize(frame.GetProperty("cols").GetInt32(), frame.GetProperty("rows").GetInt32()); break;
                case "close": return;
                case "ping": await Send(stream, new { type = "pong" }); break;
                default: throw new Exception("Unknown terminal frame");
            }
        }
    }
    private static async Task Pump(Stream source, SslStream destination)
    {
        var bytes = new byte[8192];
        while (true) { var count = await source.ReadAsync(bytes); if (count == 0) return; await Send(destination, new { type = "data", data = Convert.ToBase64String(bytes, 0, count) }); }
    }
    private static async Task Send(SslStream stream, object frame)
    {
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(frame) + "\n");
        await SendLock.WaitAsync();
        try { await stream.WriteAsync(bytes); await stream.FlushAsync(); } finally { SendLock.Release(); }
    }
    private static async Task<JsonElement> Read(Stream stream)
    {
        using var bytes = new MemoryStream(); var one = new byte[1];
        while (bytes.Length < 200000)
        {
            if (await stream.ReadAsync(one) == 0) throw new EndOfStreamException("Terminal connection closed");
            if (one[0] == 10) return JsonDocument.Parse(bytes.ToArray()).RootElement.Clone();
            bytes.WriteByte(one[0]);
        }
        throw new Exception("Terminal frame too large");
    }
    private static void ValidateSize(int cols, int rows) { if (cols < 20 || cols > 400 || rows < 5 || rows > 150) throw new Exception("Invalid terminal size"); }
    private static void Resize(int cols, int rows)
    {
        ValidateSize(cols, rows); var size = new WindowSize { cols = (ushort)cols, rows = (ushort)rows };
        if (ioctl(ttyDescriptor, 0x5414, ref size) != 0) throw new Exception("TV PTY resize failed");
    }
    private static string Quote(string value) => "'" + value.Replace("'", "'\\''") + "'";
    private static void StopTerminal() { try { if (terminal != null && !terminal.HasExited) terminal.Kill(true); } catch { } }
}
