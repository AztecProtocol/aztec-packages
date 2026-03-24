import { createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { fileURLToPath } from '@aztec/foundation/url';

import { type ChildProcess, spawn } from 'child_process';
import { dirname, resolve } from 'path';

/** Minimal interface matching the @viem/anvil Anvil shape used by callers. */
export interface Anvil {
  readonly port: number;
  readonly host: string;
  readonly status: 'listening' | 'idle';
  stop(): Promise<void>;
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
  const anvilBinary = resolve(dirname(fileURLToPath(import.meta.url)), '../../', 'scripts/anvil_kill_wrapper.sh');
  const logger = opts.log ? createLogger('ethereum:anvil') : undefined;
  const methodCalls = opts.captureMethodCalls ? ([] as string[]) : undefined;

  let detectedPort: number | undefined;

  const anvil = await retry(
    async () => {
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

      const child = spawn(anvilBinary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, RAYON_NUM_THREADS: '1' },
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

/** Send SIGTERM, wait up to 5 s, then SIGKILL. All timers are always cleared. */
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
