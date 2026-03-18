import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { Command, DaemonResponse } from './types';
import { closeBrowser } from './browser';

type Dispatcher = (cmd: Command) => Promise<DaemonResponse>;

const IDLE_MS = 30 * 60 * 1000; // 30 minutes
let lastActivity = Date.now();

export async function runSocketServer(socketPath: string, dispatch: Dispatcher): Promise<void> {
  const socketDir = path.dirname(socketPath);
  fs.mkdirSync(socketDir, { recursive: true });

  // Remove stale socket file if present
  try { fs.unlinkSync(socketPath); } catch {}

  const server = net.createServer({ allowHalfOpen: true }, (socket) => {
    lastActivity = Date.now();
    let buf = '';

    socket.on('data', (chunk) => {
      buf += chunk.toString();
      const nl = buf.indexOf('\n');
      if (nl === -1) return;

      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);

      if (!line) { socket.end(); return; }

      let cmd: Command;
      try {
        cmd = JSON.parse(line);
      } catch {
        socket.write(JSON.stringify({ ok: false, error: 'Invalid JSON command' }) + '\n');
        socket.end();
        return;
      }

      // Handle stop before dispatch so we can flush the response first
      if (cmd.command === 'stop') {
        socket.write(JSON.stringify({ ok: true, data: 'Daemon stopped' }) + '\n');
        socket.end();
        socket.on('finish', async () => {
          server.close();
          await closeBrowser();
          try { fs.unlinkSync(socketPath); } catch {}
          process.exit(0);
        });
        return;
      }

      dispatch(cmd).then((response) => {
        socket.write(JSON.stringify(response) + '\n');
        socket.end();
      }).catch((err) => {
        socket.write(JSON.stringify({ ok: false, error: (err as Error).message }) + '\n');
        socket.end();
      });
    });

    socket.on('error', () => socket.destroy());
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(socketPath, () => resolve());
    server.on('error', reject);
  });

  // Signal to parent (CLI) that we're ready
  process.stdout.write('READY\n');

  // Idle timeout
  setInterval(async () => {
    if (Date.now() - lastActivity > IDLE_MS) {
      server.close();
      await closeBrowser();
      try { fs.unlinkSync(socketPath); } catch {}
      process.exit(0);
    }
  }, 60_000).unref();

  // Clean up on signals
  async function shutdown() {
    server.close();
    await closeBrowser();
    try { fs.unlinkSync(socketPath); } catch {}
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Keep process alive
  await new Promise<void>(() => {});
}
