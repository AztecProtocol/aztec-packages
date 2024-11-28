import { makeBackoff, retry } from '@aztec/foundation/retry';
import { fileURLToPath } from '@aztec/foundation/url';

import { type Anvil, createAnvil } from '@viem/anvil';
import getPort from 'get-port';
import { dirname, resolve } from 'path';

/**
 * Ensures there's a running Anvil instance and returns the RPC URL.
 */
export async function startAnvil(l1BlockTime?: number): Promise<{ anvil: Anvil; rpcUrl: string }> {
  let ethereumHostPort: number | undefined;

  const anvilBinary = resolve(dirname(fileURLToPath(import.meta.url)), '../../', 'scripts/anvil_kill_wrapper.sh');

  // Start anvil.
  // We go via a wrapper script to ensure if the parent dies, anvil dies.
  const anvil = await retry(
    async () => {
      ethereumHostPort = await getPort();
      const anvil = createAnvil({
        anvilBinary,
        port: ethereumHostPort,
        blockTime: l1BlockTime,
      });
      await anvil.start();
      return anvil;
    },
    'Start anvil',
    makeBackoff([5, 5, 5]),
  );

  if (!ethereumHostPort) {
    throw new Error('Failed to start anvil');
  }

  const rpcUrl = `http://127.0.0.1:${ethereumHostPort}`;
  return { anvil, rpcUrl };
}
