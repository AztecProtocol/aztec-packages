import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { TEST_FEE_PADDING, setupLocalNetwork } from './local-network.js';

describe('setupLocalNetwork', () => {
  it('serves a live node on a random L1 port and tears down cleanly', async () => {
    await using net = await setupLocalNetwork();
    const info = await net.node.getNodeInfo();
    expect(info.l1ContractAddresses.rollupAddress).toBeDefined();
    expect(await net.node.getBlockNumber()).toBeGreaterThanOrEqual(0);
    expect(net.l1ChainId).toBe(31337);
    // OS-assigned ephemeral port, never the fixed default 8545.
    expect(net.l1RpcUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(net.l1RpcUrl).not.toContain(':8545');
  }, 300_000);

  it('runs two networks in parallel on distinct ports', async () => {
    const [a, b] = await Promise.all([setupLocalNetwork(), setupLocalNetwork()]);
    try {
      expect(a.l1RpcUrl).not.toEqual(b.l1RpcUrl);
      expect(await a.node.getBlockNumber()).toBeGreaterThanOrEqual(0);
      expect(await b.node.getBlockNumber()).toBeGreaterThanOrEqual(0);
    } finally {
      await Promise.all([a.stop(), b.stop()]);
    }
  }, 300_000);

  it('pre-funds addresses at genesis so they can pay for their own txs', async () => {
    const [alice] = await getInitialTestAccountsData();
    const net = await setupLocalNetwork({ fundedAddresses: [alice.address] });
    try {
      const wallet = await EmbeddedWallet.create(net.node, {
        ephemeral: true,
        pxeConfig: { proverEnabled: false },
      });
      await wallet.createSchnorrInitializerlessAccount(alice.secret, alice.salt, alice.signingKey);
      wallet.setMinFeePadding(TEST_FEE_PADDING);

      const { contract } = await TokenContract.deploy(wallet, alice.address, 'TokenName', 'TKN', 18).send({
        from: alice.address,
      });
      expect(contract.address).toBeDefined();
      expect(await net.node.getBlockNumber()).toBeGreaterThan(0);

      await wallet.stop();
    } finally {
      await net.stop();
    }
  }, 300_000);
});
