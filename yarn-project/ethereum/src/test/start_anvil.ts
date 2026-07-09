import { createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import type { TestDateProvider } from '@aztec/foundation/timer';

import { type ChildProcess, spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/** Minimal interface matching the @viem/anvil Anvil shape used by callers. */
export interface Anvil {
  readonly port: number;
  readonly host: string;
  readonly status: 'listening' | 'idle';
  stop(): Promise<void>;
}

// Every anvil we spawn is its own process-group leader (`detached: true`), so killing the group
// (`process.kill(-pid, …)`) tears down anvil and anything it forked. We track the live children and
// install best-effort signal/exit handlers so an uncleanly-killed test runner (Ctrl+C, crash) does
// not leave orphan anvils behind — this replaces the parent-polling shell wrapper we used to spawn.
const tracked = new Set<ChildProcess>();
let handlersInstalled = false;

function installHandlers(): void {
  if (handlersInstalled) {
    return;
  }
  handlersInstalled = true;

  // Async work isn't allowed in `exit` handlers, so SIGKILL the groups synchronously.
  process.on('exit', () => {
    for (const child of tracked) {
      killGroupSync(child, 'SIGKILL');
    }
  });

  // Nuke children synchronously, then re-raise the signal so the test runner exits conventionally
  // (and its own teardown still runs, unlike a bare `process.exit`).
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      for (const child of tracked) {
        killGroupSync(child, 'SIGKILL');
      }
      process.removeAllListeners(signal);
      process.kill(process.pid, signal);
    });
  }
}

function killGroupSync(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }
  try {
    if (process.platform === 'win32') {
      child.kill(signal);
    } else {
      // Negative PID → kill the whole process group. Requires `detached: true` at spawn time.
      process.kill(-child.pid, signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already dead */
    }
  }
}

/**
 * Splice the directories where `aztec-up` installs foundry/nargo binaries into `process.env.PATH`.
 * Idempotent.
 *
 * Necessary because `deployAztecL1Contracts` shells out to bare `forge`/`solc`, and those inherit
 * PATH from us. Since the aztec-up change that stopped polluting the user's interactive PATH,
 * `forge`/`cast`/`anvil`/`nargo` are only reachable via `~/.aztec/current/internal-bin/`.
 */
export function ensureAztecBinsInPath(): void {
  const dirs = [join(homedir(), '.aztec', 'current', 'internal-bin'), join(homedir(), '.foundry', 'bin')].filter(d =>
    existsSync(d),
  );

  if (dirs.length === 0) {
    return;
  }

  const sep = process.platform === 'win32' ? ';' : ':';
  const current = process.env.PATH ?? '';
  const parts = current.split(sep);
  const missing = dirs.filter(d => !parts.includes(d));
  if (missing.length === 0) {
    return;
  }

  process.env.PATH = [...missing, ...parts].filter(Boolean).join(sep);
}

/**
 * Locate the `anvil` binary. Order:
 *   1. `$ANVIL_BIN` (explicit override, e.g. for CI with a pinned version).
 *   2. `~/.aztec/current/internal-bin/anvil` — where aztec-up installs it.
 *   3. `~/.aztec/current/bin/aztec-anvil` — the publicly-exposed symlink.
 *   4. `~/.foundry/bin/anvil` — standalone foundryup install.
 *   5. `which anvil` — anything else on PATH.
 *
 * Throws with a directive message if none work.
 */
export function resolveAnvilBinary(): string {
  const envBin = process.env.ANVIL_BIN;
  if (envBin && existsSync(envBin)) {
    return envBin;
  }

  const candidates = [
    join(homedir(), '.aztec', 'current', 'internal-bin', 'anvil'),
    join(homedir(), '.aztec', 'current', 'bin', 'aztec-anvil'),
    join(homedir(), '.foundry', 'bin', 'anvil'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }

  const which = spawnSync('sh', ['-c', 'command -v anvil'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }

  throw new Error(
    'anvil binary not found. Tried $ANVIL_BIN, ~/.aztec/current/internal-bin/anvil, ' +
      '~/.aztec/current/bin/aztec-anvil, ~/.foundry/bin/anvil, and $PATH. ' +
      'Install via `aztec-up` or set ANVIL_BIN to a working binary.',
  );
}

/**
 * Ensures there's a running Anvil instance and returns the RPC URL.
 */
export async function startAnvil(
  opts: {
    port?: number;
    l1BlockTime?: number;
    log?: boolean;
    captureMethodCalls?: boolean;
    accounts?: number;
    chainId?: number;
    /** The hardfork to use (e.g. 'cancun', 'latest'). */
    hardfork?: string;
    /**
     * Number of slots per epoch used by anvil to compute the 'finalized' and 'safe' block tags.
     * Anvil reports `finalized = latest - slotsInAnEpoch * 2`.
     * Defaults to 1 so the finalized block advances immediately, making tests that check
     * L1-finality-based logic work without needing hundreds of mined blocks.
     */
    slotsInAnEpoch?: number;
    /**
     * If provided, the date provider will be synced to anvil's block time on every mined block.
     * This keeps the dateProvider in lockstep with anvil's chain time, avoiding drift between
     * the wall clock and the L1 chain when computing L1 slot timestamps.
     */
    dateProvider?: TestDateProvider;
  } = {},
): Promise<{ anvil: Anvil; methodCalls?: string[]; rpcUrl: string; stop: () => Promise<void> }> {
  ensureAztecBinsInPath();
  const anvilBinary = resolveAnvilBinary();
  const logger = opts.log ? createLogger('ethereum:anvil') : undefined;
  const methodCalls = opts.captureMethodCalls ? ([] as string[]) : undefined;

  let detectedPort: number | undefined;

  const anvil = await retry(
    async () => {
      // Pass `--port 0` to let anvil bind an OS-assigned ephemeral port; the actual port is read
      // back from its "Listening on host:port" stdout below. This lets independent suites spawn
      // their own anvil in parallel without fighting over a fixed port.
      const port = opts.port ?? (process.env.ANVIL_PORT ? parseInt(process.env.ANVIL_PORT) : 8545);
      const args: string[] = [
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--accounts',
        String(opts.accounts ?? 20),
        '--gas-limit',
        String(45_000_000),
        '--chain-id',
        String(opts.chainId ?? 31337),
      ];
      if (opts.l1BlockTime !== undefined) {
        args.push('--block-time', String(opts.l1BlockTime));
      }
      if (opts.hardfork !== undefined) {
        args.push('--hardfork', opts.hardfork);
      }
      args.push('--slots-in-an-epoch', String(opts.slotsInAnEpoch ?? 1));

      installHandlers();
      const child = spawn(anvilBinary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        env: { ...process.env, RAYON_NUM_THREADS: '1' },
      });
      tracked.add(child);
      child.once('exit', () => tracked.delete(child));

      // Wait for "Listening on" or an early exit.
      await new Promise<void>((resolve, reject) => {
        let stderr = '';

        const onStdout = (data: Buffer) => {
          const text = data.toString();
          logger?.debug(text.trim());
          methodCalls?.push(...(text.match(/eth_[^\s]+/g) || []));

          if (detectedPort === undefined && text.includes('Listening on')) {
            const match = text.match(/Listening on ([^:]+):(\d+)/);
            if (match) {
              detectedPort = parseInt(match[2]);
            }
          }
          if (detectedPort !== undefined) {
            child.stdout?.removeListener('data', onStdout);
            child.stderr?.removeListener('data', onStderr);
            child.removeListener('close', onClose);
            resolve();
          }
        };

        const onStderr = (data: Buffer) => {
          stderr += data.toString();
          logger?.debug(data.toString().trim());
        };

        const onClose = (code: number | null) => {
          child.stdout?.removeListener('data', onStdout);
          child.stderr?.removeListener('data', onStderr);
          reject(new Error(`Anvil exited with code ${code} before listening. stderr: ${stderr}`));
        };

        child.stdout?.on('data', onStdout);
        child.stderr?.on('data', onStderr);
        child.once('close', onClose);
      });

      // Continue piping for logging, method-call capture, and/or dateProvider sync after startup.
      if (logger || opts.captureMethodCalls || opts.dateProvider) {
        child.stdout?.on('data', (data: Buffer) => {
          const text = data.toString();
          logger?.debug(text.trim());
          methodCalls?.push(...(text.match(/eth_[^\s]+/g) || []));
          if (opts.dateProvider) {
            syncDateProviderFromAnvilOutput(text, opts.dateProvider);
          }
        });
        child.stderr?.on('data', (data: Buffer) => {
          logger?.debug(data.toString().trim());
        });
      } else {
        // Consume streams so the child process doesn't block on full pipe buffers.
        child.stdout?.resume();
        child.stderr?.resume();
      }

      return child;
    },
    'Start anvil',
    makeBackoff([5, 5, 5]),
  );

  if (!detectedPort) {
    throw new Error('Failed to start anvil');
  }

  const port = detectedPort;
  let status: 'listening' | 'idle' = 'listening';

  anvil.once('close', () => {
    status = 'idle';
  });

  const stop = async () => {
    if (status === 'idle') {
      return;
    }
    await killChild(anvil);
  };

  const anvilObj: Anvil = {
    port,
    host: '127.0.0.1',
    get status() {
      return status;
    },
    stop,
  };

  return { anvil: anvilObj, methodCalls, stop, rpcUrl: `http://127.0.0.1:${port}` };
}

/** Extracts block time from anvil stdout and syncs the dateProvider. */
function syncDateProviderFromAnvilOutput(text: string, dateProvider: TestDateProvider): void {
  // Anvil logs mined blocks as:
  //   Block Time: "Fri, 20 Mar 2026 02:10:46 +0000"
  const match = text.match(/Block Time:\s*"([^"]+)"/);
  if (match) {
    const blockTimeMs = new Date(match[1]).getTime();
    if (!isNaN(blockTimeMs)) {
      dateProvider.setTime(blockTimeMs);
    }
  }
}

/** Send SIGTERM to the process group, wait up to 5 s, then SIGKILL. All timers are always cleared. */
function killChild(child: ChildProcess): Promise<void> {
  return new Promise<void>(resolve => {
    tracked.delete(child);

    if (child.exitCode !== null || child.killed) {
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve();
      return;
    }

    let killTimer: NodeJS.Timeout | undefined;

    const onClose = () => {
      if (killTimer !== undefined) {
        clearTimeout(killTimer);
      }
      // Destroy stdio streams so their PipeWrap handles don't keep the event loop alive.
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve();
    };

    child.once('close', onClose);
    killGroupSync(child, 'SIGTERM');

    killTimer = setTimeout(() => {
      killTimer = undefined;
      killGroupSync(child, 'SIGKILL');
    }, 5000);

    // Ensure the timer does not prevent Node from exiting.
    killTimer.unref();
  });
}
