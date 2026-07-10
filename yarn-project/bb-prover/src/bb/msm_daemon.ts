import type { Logger } from '@aztec/foundation/log';

import { type ChildProcess, spawn } from 'child_process';
import * as net from 'net';
import * as path from 'path';

let ensured: Promise<void> | undefined;
let daemon: ChildProcess | undefined;

function isLive(socketPath: string): Promise<boolean> {
  return new Promise(resolve => {
    const sock = net.connect(socketPath);
    sock.once('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => resolve(false));
  });
}

async function waitForSocket(socketPath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLive(socketPath)) {
      return;
    }
    await new Promise(res => setTimeout(res, 500));
  }
  throw new Error(`bb-msm daemon did not open ${socketPath} within ${timeoutMs}ms`);
}

/**
 * Ensures a bb-msm MSM offload daemon is reachable at the socket named by BB_MSM_SOCKET.
 *
 * Opt-in via the env var: when it is unset this is a no-op (bb uses its local MSM paths).
 * When set and a daemon is already listening there (externally managed), we attach to it.
 * When set and nothing is listening, we spawn `bb-msm` (sibling of the bb binary) serving
 * that socket. The daemon monitors parent death, so it exits with this process.
 */
export function ensureBbMsmDaemon(bbBinaryPath: string, logger?: Logger): Promise<void> {
  ensured ??= (async () => {
    const socketPath = process.env.BB_MSM_SOCKET;
    if (!socketPath) {
      return;
    }
    if (await isLive(socketPath)) {
      logger?.info(`Using externally managed bb-msm daemon at ${socketPath}`);
      return;
    }
    const daemonPath = path.join(path.dirname(bbBinaryPath), 'bb-msm');
    logger?.info(`Starting bb-msm daemon ${daemonPath} on ${socketPath}`);
    daemon = spawn(daemonPath, ['msgpack', 'run', '-i', socketPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    daemon.stdout?.on('data', (d: Buffer) => logger?.verbose(`bb-msm: ${d.toString().trimEnd()}`));
    daemon.stderr?.on('data', (d: Buffer) => logger?.verbose(`bb-msm: ${d.toString().trimEnd()}`));
    daemon.on('exit', code => logger?.info(`bb-msm daemon exited with code ${code}`));
    // SRS load can take ~30s (longer on first run while the CRS downloads).
    await waitForSocket(socketPath, 300_000);
    logger?.info(`bb-msm daemon ready at ${socketPath}`);
  })();
  return ensured;
}
