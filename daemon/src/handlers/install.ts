import { spawnSync } from 'child_process';

export async function handleInstall(): Promise<{ message: string }> {
  // Route subprocess output to daemon's stderr so it reaches the user terminal
  // (the CLI inherits daemon stderr via Stdio::inherit in main.rs)
  const result = spawnSync('npx', ['playwright', 'install', 'chromium'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    throw new Error('Playwright browser installation failed');
  }

  return { message: 'Chromium installed successfully.' };
}
