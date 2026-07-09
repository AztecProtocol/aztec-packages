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

// Watchdog wrapper: instead of spawning anvil directly, we spawn a small bash supervisor that runs
// anvil as a background child and polls its own parent (this node process). If the parent dies for
// ANY reason — including SIGKILL / crash / OOM, where node's own exit handlers never run — the poll
// loop ends and the EXIT trap reaps anvil. This is the guarantee the old `anvil_kill_wrapper.sh`
// gave us; orphan anvils holding ports were a long-standing source of CI flakiness. The script is
// inlined (rather than shipped as a `.sh`) so it works from the published npm tarball too, and the
// resolved anvil binary is passed via `$ANVIL_BIN` so it works without `anvil` on PATH.
//
// `$@` is the anvil argv; `bash -c <script> bash <...args>` puts the args in `$@` and `$0` = 'bash'.
//
// The EXIT trap reaps anvil; INT/TERM just `exit` (which fires the EXIT trap) so a signal terminates
// the supervisor promptly instead of being swallowed — a trapped TERM does NOT terminate the shell,
// so trapping the kill directly on TERM would leave the poll loop running and the caller's teardown
// hanging until its SIGKILL escalation. `sleep & wait` makes the poll interruptible, so INT/TERM are
// handled immediately rather than after the current `sleep` returns.
const ANVIL_WATCHDOG = `
set -u
parent=$PPID
"$ANVIL_BIN" "$@" &
anvil_pid=$!
trap 'kill "$anvil_pid" 2>/dev/null' EXIT
trap 'exit 0' INT TERM
while kill -0 "$parent" 2>/dev/null; do sleep 1 & wait $!; done
`;

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
      // `--port 0` lets anvil bind an OS-assigned ephemeral port; the actual port is read back from
      // its "Listening on host:port" stdout below, so independent suites can spawn their own anvil
      // in parallel without fighting over a fixed port.
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

      // Spawn the watchdog (see ANVIL_WATCHDOG). It launches anvil with these args and reaps it if we
      // die; `$0` is 'bash' and `$@` is the anvil argv.
      const child = spawn('bash', ['-c', ANVIL_WATCHDOG, 'bash', ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ANVIL_BIN: anvilBinary, RAYON_NUM_THREADS: '1' },
      });

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

/**
 * Send SIGTERM to the watchdog, wait up to 5 s, then SIGKILL. The watchdog's trap forwards the
 * signal to anvil, so terminating it tears down anvil too. All timers are always cleared.
 */
function killChild(child: ChildProcess): Promise<void> {
  return new Promise<void>(resolve => {
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
    child.kill('SIGTERM');

    killTimer = setTimeout(() => {
      killTimer = undefined;
      child.kill('SIGKILL');
    }, 5000);

    // Ensure the timer does not prevent Node from exiting.
    killTimer.unref();
  });
}
