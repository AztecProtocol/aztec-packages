import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { TEST_FEE_PADDING, setupLocalNetwork } from './local-network.js';

// Heavy integration fixture: each case spawns anvil, deploys the L1 contracts via forge, and runs a
// full in-process node. Requires an aztec-up Foundry toolchain on PATH. Not part of the fast unit
// gate (the package's CI test_cmds only covers src/cli); run explicitly with
// `yarn workspace @aztec/aztec test src/testing/local-network.test.ts`.
describe('setupLocalNetwork', () => {
  it('serves a live node on a random L1 port and tears down cleanly', async () => {
    const net = await setupLocalNetwork();
    try {
      const info = await net.node.getNodeInfo();
      expect(info.l1ContractAddresses.rollupAddress).toBeDefined();
      expect(await net.node.getBlockNumber()).toBeGreaterThanOrEqual(0);
      expect(net.l1ChainId).toBe(31337);
      // OS-assigned ephemeral port, never the fixed default 8545.
      expect(net.l1RpcUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(net.l1RpcUrl).not.toContain(':8545');
    } finally {
      await net.stop();
    }
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

      // Deploying a contract paying from alice's own genesis fee juice proves the funded path
      // end-to-end: without genesis funding this tx would be rejected for lack of fee juice.
      const { contract } = await TokenContract.deploy(wallet, alice.address, 'TokenName', 'TKN', 18).send({
        from: alice.address,
      });
      expect(contract.address).toBeDefined();

      await wallet.stop();
    } finally {
      await net.stop();
    }
  }, 300_000);
});
