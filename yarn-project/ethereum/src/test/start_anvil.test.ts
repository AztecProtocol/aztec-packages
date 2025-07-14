import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import type { Anvil } from '@viem/anvil';
import { createPublicClient, http, parseAbiItem } from 'viem';

import { startAnvil } from './start_anvil.js';

describe('start_anvil', () => {
  let logger: Logger;
  let anvil: Anvil;
  let rpcUrl: string;
  let sleepAfterTeardown: number;

  beforeEach(async () => {
    sleepAfterTeardown = 0;
    logger = createLogger('ethereum:test:anvil');
    ({ anvil, rpcUrl } = await startAnvil());
  });

  afterEach(async () => {
    await anvil.stop().catch(err => logger.error(err));
    await sleep(sleepAfterTeardown);
  });

  it('starts anvil on a free port', async () => {
    const port = parseInt(new URL(rpcUrl).port);
    expect(port).toBeLessThan(65536);
    expect(port).toBeGreaterThan(1024);
    expect(anvil.port).toEqual(port);

    const host = new URL(rpcUrl).hostname;
    expect(anvil.host).toEqual(host);

    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const chainId = await publicClient.getChainId();
    expect(chainId).toEqual(31337);
    expect(anvil.status).toEqual('listening');

    await anvil.stop().catch(err => createLogger('cleanup').error(err));
    expect(anvil.status).toEqual('idle');
  });

  it('ignores errors uninstalling filters during teardown', async () => {
    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const abiItem = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

    const stopWatching = publicClient.watchEvent({ event: abiItem, onLogs: () => {} });
    await sleep(100);

    sleepAfterTeardown = 3000;
    setTimeout(() => {
      logger.info('Stopping watch event');
      stopWatching();
    }, 500);
  });
});
