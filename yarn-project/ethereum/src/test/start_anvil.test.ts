import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';

import { createPublicClient, http, parseAbiItem } from 'viem';

import type { Anvil } from './start_anvil.js';
import { startAnvil } from './start_anvil.js';

describe('start_anvil', () => {
  let logger: Logger;
  let anvil: Anvil;
  let rpcUrl: string;

  beforeEach(async () => {
    logger = createLogger('ethereum:test:anvil');
    ({ anvil, rpcUrl } = await startAnvil());
  });

  afterEach(async () => {
    await anvil.stop().catch(err => logger.error(err));
  });

  it('starts anvil on a free port', async () => {
    const port = parseInt(new URL(rpcUrl).port);
    expect(port).toBeLessThan(65536);
    expect(port).toBeGreaterThan(1024);
    expect(anvil.port).toEqual(port);

    const host = new URL(rpcUrl).hostname;
    expect(anvil.host).toEqual(host);

    const publicClient = createPublicClient({ transport: http(rpcUrl, { batch: false }) });
    const chainId = await publicClient.getChainId();
    expect(chainId).toEqual(31337);
    expect(anvil.status).toEqual('listening');

    await anvil.stop().catch(err => createLogger('cleanup').error(err));
    expect(anvil.status).toEqual('idle');
  });

  it('ignores errors uninstalling filters during teardown', async () => {
    const publicClient = createPublicClient({ transport: http(rpcUrl, { batch: false }) });
    const abiItem = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

    const stopWatching = publicClient.watchEvent({ event: abiItem, onLogs: () => {} });
    await sleep(100);

    // Stop watching while anvil is still alive so the filter is cleanly uninstalled.
    // Stopping anvil first and then calling stopWatching() causes eth_uninstallFilter
    // to hit a dead server, leaving dangling undici sockets that prevent exit.
    logger.info('Stopping watch event');
    stopWatching();
    await sleep(100);
  });

  it('syncs dateProvider to anvil block time on each mined block', async () => {
    // Stop the default anvil instance (no dateProvider).
    await anvil.stop();

    const dateProvider = new TestDateProvider();
    const res = await startAnvil({ dateProvider });
    anvil = res.anvil;
    rpcUrl = res.rpcUrl;

    const publicClient = createPublicClient({ transport: http(rpcUrl, { batch: false }) });

    // Mine a block so anvil emits a "Block Time" line.
    await publicClient.request({ method: 'evm_mine', params: [] } as any);
    // Give the stdout listener time to fire.
    await sleep(200);

    const block = await publicClient.getBlock({ blockTag: 'latest' });
    const blockTimeMs = Number(block.timestamp) * 1000;
    // The dateProvider should now be within 2 seconds of the anvil block time.
    // TestDateProvider.now() = Date.now() + offset, and setTime sets offset = blockTimeMs - Date.now(),
    // so subsequent now() calls return blockTimeMs + elapsed. We check the difference is small.
    expect(Math.abs(dateProvider.now() - blockTimeMs)).toBeLessThan(2000);

    // Warp anvil forward by 1000 seconds and verify the dateProvider follows.
    const futureTimestamp = Number(block.timestamp) + 1000;
    await publicClient.request({
      method: 'evm_setNextBlockTimestamp',
      params: [futureTimestamp],
    } as any);
    await publicClient.request({ method: 'evm_mine', params: [] } as any);
    await sleep(200);

    const futureTimeMs = futureTimestamp * 1000;
    expect(Math.abs(dateProvider.now() - futureTimeMs)).toBeLessThan(2000);
  });
});
