import { createPublicClient, http } from 'viem';

import { startAnvil } from './start_anvil.js';

describe('start_anvil', () => {
  it('starts anvil on a free port', async () => {
    const { anvil, rpcUrl } = await startAnvil();
    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const chainId = await publicClient.getChainId();
    expect(chainId).toEqual(31337);
    expect(anvil.status).toEqual('listening');

    await anvil.stop();
    expect(anvil.status).toEqual('idle');
  }, 30000);
});
