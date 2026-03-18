import * as readline from 'readline';
import { Command, DaemonResponse } from './types';
import { closeBrowser } from './browser';
import { handleInstall } from './handlers/install';
import { handleOpen } from './handlers/open';
import { handleSnapshot } from './handlers/snapshot';
import { handleClick } from './handlers/click';
import { handleType } from './handlers/type';
import { runSocketServer } from './socket';

export async function dispatch(cmd: Command): Promise<DaemonResponse> {
  try {
    switch (cmd.command) {
      case 'install': {
        const data = await handleInstall();
        return { ok: true, data };
      }
      case 'open': {
        const data = await handleOpen(cmd.args, cmd.profile);
        return { ok: true, data };
      }
      case 'snapshot': {
        const output = await handleSnapshot(cmd.format ?? 'json', cmd.profile);
        return { ok: true, data: output };
      }
      case 'click': {
        const data = await handleClick(cmd.args, cmd.profile);
        return { ok: true, data };
      }
      case 'type': {
        const data = await handleType(cmd.args, cmd.profile);
        return { ok: true, data };
      }
      default:
        return { ok: false, error: `Unknown command: ${cmd.command}` };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function send(response: DaemonResponse): void {
  process.stdout.write(JSON.stringify(response) + '\n');
}

async function runStdinServer(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const pending: Promise<void>[] = [];

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let cmd: Command;
    try {
      cmd = JSON.parse(trimmed);
    } catch {
      send({ ok: false, error: 'Invalid JSON command' });
      return;
    }

    pending.push(dispatch(cmd).then(send));
  });

  rl.on('close', async () => {
    await Promise.all(pending);
    await closeBrowser();
    process.exit(0);
  });
}

async function main(): Promise<void> {
  const socketFlagIdx = process.argv.indexOf('--socket');
  if (socketFlagIdx !== -1) {
    const socketPath = process.argv[socketFlagIdx + 1];
    if (!socketPath) {
      process.stderr.write('--socket requires a path argument\n');
      process.exit(1);
    }
    await runSocketServer(socketPath, dispatch);
  } else {
    await runStdinServer();
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal daemon error: ${err.message}\n`);
  process.exit(1);
});
