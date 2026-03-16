import { createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
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
    /**
     * Number of slots per epoch used by anvil to compute the 'finalized' and 'safe' block tags.
     * Anvil reports `finalized = latest - slotsInAnEpoch * 2`.
     * Defaults to 1 so the finalized block advances immediately, making tests that check
     * L1-finality-based logic work without needing hundreds of mined blocks.
     */
    slotsInAnEpoch?: number;
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
      // slotsInAnEpoch is supported by anvil but not yet in @viem/anvil types
      const anvil = createAnvil({
        anvilBinary,
        host: '127.0.0.1',
        port: opts.port ?? (process.env.ANVIL_PORT ? parseInt(process.env.ANVIL_PORT) : 8545),
        blockTime: opts.l1BlockTime,
        stopTimeout: 1000,
        accounts: opts.accounts ?? 20,
        gasLimit: 45_000_000n,
        chainId: opts.chainId ?? 31337,
        slotsInAnEpoch: opts.slotsInAnEpoch ?? 1,
      } as Parameters<typeof createAnvil>[0]);

      // Listen to the anvil output to get the port.
      const removeHandler = anvil.on('message', (message: string) => {
        logger?.debug(message.trim());

        methodCalls?.push(...(message.match(/eth_[^\s]+/g) || []));
        if (port === undefined && message.includes('Listening on')) {
          port = parseInt(message.match(/Listening on ([^:]+):(\d+)/)![2]);
        }
      });
      await anvil.start();
      if (!logger && !opts.captureMethodCalls) {
        removeHandler();
      }

      return anvil;
    },
    'Start anvil',
    makeBackoff([5, 5, 5]),
  );

  if (!port) {
    throw new Error('Failed to start anvil');
  }

  // Monkeypatch the anvil instance to include the actually assigned port
  // Object.defineProperty(anvil, 'port', { value: port, writable: false });
  return { anvil, methodCalls, stop: () => anvil.stop(), rpcUrl: `http://127.0.0.1:${port}` };
}
