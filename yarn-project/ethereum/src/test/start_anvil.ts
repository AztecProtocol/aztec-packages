import { createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { fileURLToPath } from '@aztec/foundation/url';

import { type Anvil, createAnvil } from '@viem/anvil';
import { dirname, resolve } from 'path';

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
    /** The hardfork to use - note: @viem/anvil types are out of date but 'cancun' and 'latest' work */
    hardfork?: string;
<<<<<<< HEAD
=======
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
>>>>>>> 562e53d23d (fix: sync dateProvider from anvil stdout on every mined block)
  } = {},
): Promise<{ anvil: Anvil; methodCalls?: string[]; rpcUrl: string; stop: () => Promise<void> }> {
  const anvilBinary = resolve(dirname(fileURLToPath(import.meta.url)), '../../', 'scripts/anvil_kill_wrapper.sh');
  const logger = opts.log ? createLogger('ethereum:anvil') : undefined;
  const methodCalls = opts.captureMethodCalls ? ([] as string[]) : undefined;

  let port: number | undefined;

  // Start anvil.
  // We go via a wrapper script to ensure if the parent dies, anvil dies.
  const anvil = await retry(
    async () => {
      const anvil = createAnvil({
        anvilBinary,
        host: '127.0.0.1',
        port: opts.port ?? (process.env.ANVIL_PORT ? parseInt(process.env.ANVIL_PORT) : 8545),
        blockTime: opts.l1BlockTime,
        stopTimeout: 1000,
        accounts: opts.accounts ?? 20,
        gasLimit: 45_000_000n,
        chainId: opts.chainId ?? 31337,
      });

      // Listen to the anvil output to get the port.
      const removeHandler = anvil.on('message', (message: string) => {
        logger?.debug(message.trim());

        methodCalls?.push(...(message.match(/eth_[^\s]+/g) || []));
        if (port === undefined && message.includes('Listening on')) {
          port = parseInt(message.match(/Listening on ([^:]+):(\d+)/)![2]);
        }
      });
<<<<<<< HEAD
      await anvil.start();
      if (!logger && !opts.captureMethodCalls) {
        removeHandler();
=======

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
>>>>>>> 562e53d23d (fix: sync dateProvider from anvil stdout on every mined block)
      }

      return anvil;
    },
    'Start anvil',
    makeBackoff([5, 5, 5]),
  );

  if (!port) {
    throw new Error('Failed to start anvil');
  }

<<<<<<< HEAD
  // Monkeypatch the anvil instance to include the actually assigned port
  // Object.defineProperty(anvil, 'port', { value: port, writable: false });
  return { anvil, methodCalls, stop: () => anvil.stop(), rpcUrl: `http://127.0.0.1:${port}` };
=======
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
>>>>>>> 562e53d23d (fix: sync dateProvider from anvil stdout on every mined block)
}
