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
    captureMethodCalls?: boolean;
  } = {},
): Promise<{ anvil: Anvil; methodCalls?: string[]; rpcUrl: string; stop: () => Promise<void> }> {
  const anvilBinary = resolve(dirname(fileURLToPath(import.meta.url)), '../../', 'scripts/anvil_kill_wrapper.sh');
  const methodCalls = opts.captureMethodCalls ? ([] as string[]) : undefined;

  let port: number | undefined;

  // Start anvil.
  // We go via a wrapper script to ensure if the parent dies, anvil dies.
  const anvil = await retry(
    async () => {
      const anvil = createAnvil({
        anvilBinary,
        host: '127.0.0.1',
        port: opts.port ?? 8545,
        blockTime: opts.l1BlockTime,
        stopTimeout: 1000,
        accounts: 20,
      });

      // Listen to the anvil output to get the port.
      const removeHandler = anvil.on('message', (message: string) => {
        methodCalls?.push(...(message.match(/eth_[^\s]+/g) || []));
        if (port === undefined && message.includes('Listening on')) {
          port = parseInt(message.match(/Listening on ([^:]+):(\d+)/)![2]);
        }
      });
      await anvil.start();
      removeHandler();
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
