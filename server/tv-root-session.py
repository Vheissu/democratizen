"""Hold the pinned archive route for one authenticated reverse-TLS TV PTY."""
from __future__ import annotations

import asyncio
import contextlib
import hmac
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import shlex
import signal
import ssl
import sys
import tempfile


def emit(kind, **fields):
    print(json.dumps({"type": kind, **fields}), flush=True)


async def run(config):
    # These private helpers are deliberately tied to the revision checked by setup.
    sys.path.insert(0, str(Path(config["tool"]) / "src"))
    from samsung_tv_root import archive_root as archive
    from samsung_tv_root import sdb as sdb_module
    from samsung_tv_root.root_agent import RootAgentServer, generate_secret
    from samsung_tv_root.sdb import SdbClient
    # This Frame rejects some inline commands near the upstream 510-byte limit.
    # Longer commands use the upstream staged-script path instead.
    sdb_module.SDB_APPINSTALL_MAX_SAFE_BYTES = 400

    for name in ("tvIP", "host"):
        ipaddress.IPv4Address(config[name])
    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stopped.set)
    pending = loop.create_future()
    writer = None
    connection = None
    agent = None
    staged = False
    assessment = None
    failed = False
    helper_pid = None
    terminal_directory = None
    package = "archive-root-" + secrets.token_hex(8)
    staging = archive.STAGING_ROOT / package
    client = SdbClient(Path(config["sdb"]), config["tvIP"], timeout=15)
    token = secrets.token_hex(32)
    accepted = False

    async def accept_tls(reader, peer):
        nonlocal accepted
        try:
            if stopped.is_set() or accepted or peer.get_extra_info("peername")[0] != config["tvIP"]:
                return
            raw = await asyncio.wait_for(reader.readline(), 5)
            auth = json.loads(raw)
            if auth.get("type") != "auth" or not isinstance(auth.get("token"), str) or not hmac.compare_digest(auth["token"], token) or type(auth.get("uid")) is not int or type(auth.get("euid")) is not int or auth["uid"] != 0 or auth["euid"] != 0:
                return
            if accepted or stopped.is_set():
                return
            accepted = True
            pending.set_result((reader, peer))
            return
        except (Exception, asyncio.CancelledError):
            pass
        finally:
            if not accepted or pending.cancelled() or (pending.done() and pending.result()[1] is not peer):
                peer.close()

    tls_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls_context.minimum_version = ssl.TLSVersion.TLSv1_2
    tls_context.load_cert_chain(config["certificate"], config["privateKey"])
    tls_server = await asyncio.start_server(accept_tls, config["host"], 0, ssl=tls_context, ssl_handshake_timeout=5, limit=200000)
    reader = asyncio.StreamReader(limit=200000)
    await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin.buffer)

    async def commands():
        while not stopped.is_set():
            line = await reader.readline()
            if not line:
                stopped.set()
                return
            message = json.loads(line)
            if message.get("type") == "close":
                stopped.set()
                return
            if message.get("type") not in ("input", "resize"):
                raise ValueError("Unsupported local terminal command")
            if writer is not None:
                writer.write(line)
                await writer.drain()

    command_task = asyncio.create_task(commands())
    relay_task = None
    heartbeat_task = None
    stop_task = asyncio.create_task(stopped.wait())
    try:
        emit("phase", message="Checking TV developer access…")
        assessment = await asyncio.to_thread(archive._check_target, client)
        if stopped.is_set():
            return
        agent = RootAgentServer(config["host"], 0, config["tvIP"], generate_secret(), require_root=True)
        await agent.start()
        emit("phase", message="Acquiring temporary TV root access…", staging=str(staging))
        with tempfile.TemporaryDirectory(prefix="frame-tv-root-") as temporary:
            directory = Path(temporary)
            archive._prepare_artifacts(directory, assessment.runtime, package, config["host"], agent.listening_port, agent.secret)
            staged = True
            await asyncio.to_thread(archive._stage, client, directory, Path(config["rootPayloads"]), package)
            await asyncio.to_thread(client.require_shell_injection)
            launch = f"/usr/bin/dotnet {staging}/SamsungTvArchiveRoot.dll {package} >{staging}/archive-start.log 2>&1 </dev/null 3>&- & echo $!"
            await asyncio.to_thread(archive._capture, client, launch)
            connection = await agent.accept(35)
            identity = await connection.ping()
            if identity.uid != 0 or identity.euid != 0:
                raise RuntimeError("TV agent did not prove root")
            terminal_directory = PurePosixPath(f"/run/samsung-tv-root/agent-{identity.pid}")
            for name in ("FrameTerminalPty.dll", "FrameTerminalPty.runtimeconfig.json", "FrameTerminalPty.deps.json"):
                await connection.write_file(terminal_directory / name, (Path(config["ptyPayloads"]) / name).read_bytes())
            settings = {"host": config["host"], "port": tls_server.sockets[0].getsockname()[1], "fingerprint": config["fingerprint"], "token": token, "directory": str(terminal_directory)}
            await connection.write_file(terminal_directory / "terminal.json", json.dumps(settings).encode())
            secured = await connection.execute(f"chmod 600 {terminal_directory}/terminal.json", 5)
            if secured.exit_code != 0 or secured.timed_out:
                raise RuntimeError("Could not protect the TV terminal credential")
            emit("phase", message="Opening the TV terminal over TLS…")
            command = f"/usr/bin/setsid /usr/bin/dotnet {terminal_directory}/FrameTerminalPty.dll {terminal_directory}/terminal.json >{terminal_directory}/terminal.log 2>&1 </dev/null & echo $!"
            result = await connection.execute(command, 10)
            if result.exit_code != 0 or result.timed_out or not result.stdout.strip().isdigit():
                raise RuntimeError("TV terminal helper could not start")
            helper_pid = int(result.stdout.strip())
            try:
                tls_reader, writer = await asyncio.wait_for(asyncio.shield(pending), 25)
            except asyncio.TimeoutError:
                log = await connection.execute(f"cat {terminal_directory}/terminal.log", 5)
                raise RuntimeError("TV terminal callback failed: " + log.stdout.strip()[:1200])
            tls_server.close()
            writer.write((json.dumps({"type": "start", "cols": config["cols"], "rows": config["rows"]}) + "\n").encode())
            await writer.drain()

            async def relay():
                while True:
                    line = await asyncio.wait_for(tls_reader.readline(), 45)
                    if not line:
                        raise RuntimeError("TV terminal disconnected")
                    frame = json.loads(line)
                    kind = frame.get("type")
                    if kind == "ready":
                        emit("ready", uid=identity.uid, euid=identity.euid, smack=identity.smack_label.strip())
                    elif kind == "data":
                        emit("data", data=frame["data"])
                    elif kind == "exit":
                        emit("shell-exit", exitCode=frame["exitCode"])
                        return
                    elif kind != "pong":
                        raise RuntimeError("Invalid TV terminal frame")

            async def heartbeat():
                while True:
                    await asyncio.sleep(15)
                    writer.write(b'{"type":"ping"}\n')
                    await writer.drain()

            relay_task = asyncio.create_task(relay())
            heartbeat_task = asyncio.create_task(heartbeat())
            done, _ = await asyncio.wait([relay_task, stop_task, command_task, heartbeat_task], return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                if task is not stop_task:
                    task.result()
    except Exception as error:
        failed = True
        detail = str(error)
        if connection is not None and helper_pid is not None:
            with contextlib.suppress(Exception):
                log = await connection.execute(f"tail -c 1000 {terminal_directory}/terminal.log", 5)
                if log.stdout.strip():
                    detail += ": " + log.stdout.strip()
        emit("error", message=detail[:1600])
    finally:
        stopped.set()
        if writer is not None:
            with contextlib.suppress(Exception):
                writer.write(b'{"type":"close"}\n')
                await writer.drain()
                await asyncio.sleep(0.3)
                writer.close()
                await asyncio.wait_for(writer.wait_closed(), 3)
        for task in (command_task, relay_task, heartbeat_task, stop_task):
            if task is not None:
                task.cancel()
        tls_server.close()
        await tls_server.wait_closed()
        cleanup_error = None
        runtime_cleaned = terminal_directory is None
        if connection is not None:
            try:
                if helper_pid is not None:
                    check = f"if test -e /proc/{helper_pid}/cmdline && tr '\\000' ' ' </proc/{helper_pid}/cmdline | grep -F {shlex.quote(str(terminal_directory) + '/FrameTerminalPty.dll')} >/dev/null; then echo helper-still-running; kill -TERM {helper_pid}; fi"
                    result = await connection.execute(check, 5)
                    if "helper-still-running" in result.stdout:
                        cleanup_error = "TV terminal helper did not confirm a graceful stop"
                if terminal_directory is not None:
                    result = await connection.execute(f"rm -rf {terminal_directory}; test ! -e {terminal_directory} && echo runtime-removed", 5)
                    runtime_cleaned = result.exit_code == 0 and "runtime-removed" in result.stdout
                await connection.shutdown()
            except Exception as error:
                cleanup_error = "Root agent shutdown was not confirmed: " + str(error)[:1000]
        if agent is not None:
            await agent.close()
        cleaned = not staged
        unchanged = assessment is None
        try:
            if staged:
                await asyncio.to_thread(client.require_shell_injection)
                # The archive launcher writes its result only after unwinding its mount namespace.
                for _ in range(30):
                    log = await asyncio.to_thread(archive._capture, client, f"cat {staging}/launcher.log")
                    if log.startswith("exit=0"):
                        break
                    await asyncio.sleep(0.2)
                else:
                    cleanup_error = "Archive launcher shutdown was not confirmed"
                cleaned = await asyncio.to_thread(archive._cleanup, client, package)
            if assessment is not None:
                hashes = await asyncio.to_thread(archive._capture, client, archive.SYSTEM_HASH_COMMAND)
                unchanged = hashes == assessment.original_hashes
        except Exception as error:
            cleanup_error = "TV cleanup verification failed: " + str(error)[:1000]
        ok = cleaned and unchanged and runtime_cleaned and cleanup_error is None
        emit("cleanup", staging=str(staging), staging_cleaned=cleaned, runtime_cleaned=runtime_cleaned, system_files_unchanged=unchanged, confirmed=ok)
        if not ok:
            emit("error", message=cleanup_error or "TV staging/system checks failed")
        return 1 if failed or not ok else 0


if __name__ == "__main__":
    try:
        # Read the initial frame without buffered prefetch stealing later IPC frames.
        line = bytearray()
        while len(line) < 65536:
            byte = os.read(sys.stdin.fileno(), 1)
            if byte in (b"", b"\n"):
                break
            line.extend(byte)
        config = json.loads(line)
        sys.exit(asyncio.run(run(config)))
    except Exception as error:
        emit("error", message=str(error)[:1600])
        sys.exit(1)
