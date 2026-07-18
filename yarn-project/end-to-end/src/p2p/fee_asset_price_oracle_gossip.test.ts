import type { AztecNodeService } from '@aztec/aztec-node';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { RollupContract, STATE_VIEW_ADDRESS } from '@aztec/ethereum/contracts';
import { retryUntil } from '@aztec/foundation/retry';
import { tryStop } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { MNEMONIC, shouldCollectMetrics } from '../fixtures/fixtures.js';
import { ATTESTER_PRIVATE_KEYS_START_INDEX, createProverNode } from '../fixtures/setup_p2p_test.js';
import { MockStateView, diffInBps } from '../shared/mock_state_view.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES } from './p2p_network.js';
import { maybeCheckQosAlerts, runGossipScenario, waitForNodesToSync } from './shared.js';

// Don't set NUM_VALIDATORS higher than 9 because each node uses a different L1 publisher account and anvil seeds.
const NUM_VALIDATORS = 4;
const BOOT_NODE_UDP_PORT = 4500;

jest.setTimeout(1000 * 60 * 10);

// Tests that the fee-asset price oracle value set on a mock L1 StateView contract gossips through the
// real libp2p validator network and converges on the rollup's on-chain price. Runs on the shared gossip
// skeleton (runGossipScenario) with txsPerNode:0 — no txs are submitted; instead the oracle price is
// adjusted twice and the on-chain price is asserted to converge. Uses P2PNetworkTest with
// SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES (ethSlot=4s, aztecSlot=12s, epoch=4, proofSubEpochs=640) plus a
// real prover node. CHECK_ALERTS env var gates optional Grafana alert validation.
describe('e2e_p2p_network', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let proverNode: AztecNodeService;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_network_fee_asset_price_oracle',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      startProverNode: false, // we'll start our own using p2p
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
        aztecSlotDuration: 12,
        aztecEpochDuration: 4,
        slashingRoundSizeInEpochs: 2,
        slashingQuorum: 5,
        listenAddress: '127.0.0.1',
        // Pipelining: target-slot is one ahead of build-slot; inboxLag sources L1->L2
        // messages from the previous checkpoint to avoid L1ToL2MessagesNotReadyError.
      },
    });

    await t.setup();
    await t.applyBaseSetup();
  });

  afterEach(async () => {
    await tryStop(proverNode);
    await t.stopNodes(nodes);
    await t.teardown();
  });

  afterAll(async () => {
    await maybeCheckQosAlerts(t.logger);
  });

  // Deploys a MockStateView L1 contract, sets an initial oracle price, then starts 4 validator nodes
  // and a prover. Adjusts the oracle price twice and uses retryUntil to confirm the rollup's on-chain
  // price converges to each target within the gossip propagation window.
  it('should rollup txs from all peers', async () => {
    const rollup = RollupContract.getFromL1ContractsValues(t.ctx.deployL1ContractsValues);

    const account = mnemonicToAccount(MNEMONIC, { addressIndex: 999 });
    const walletClient = createExtendedL1Client(t.ctx.aztecNodeConfig.l1RpcUrls, account, foundry);

    let mockStateView!: MockStateView;
    let initialOnChainPrice!: bigint;
    let targetOraclePrice!: bigint;

    nodes = await runGossipScenario({
      t,
      numValidators: NUM_VALIDATORS,
      bootNodePort: BOOT_NODE_UDP_PORT,
      txsPerNode: 0,
      checkpointSource: 'first-published',
      beforeCreateNodes: async () => {
        await t.ctx.ethCheatCodes.setBalance(account.address, 100n * 10n ** 18n);

        mockStateView = await MockStateView.deploy(t.ctx.ethCheatCodes, walletClient, STATE_VIEW_ADDRESS);

        // The initial oracle price (default value) is 1e7
        await mockStateView.setEthPerFeeAsset(10n ** 7n);

        await t.ctx.ethCheatCodes.mineEmptyBlock();
        await t.ctx.ethCheatCodes.mine(10);
        await t.ctx.ethCheatCodes.mineEmptyBlock();
      },
      createExtraNodes: async () => {
        t.logger.warn(`Creating prover node`);
        ({ proverNode } = await createProverNode(
          { ...t.ctx.aztecNodeConfig, minTxsPerBlock: 0 },
          BOOT_NODE_UDP_PORT + NUM_VALIDATORS + 1,
          t.bootstrapNodeEnr,
          ATTESTER_PRIVATE_KEYS_START_INDEX + NUM_VALIDATORS + 1,
          { dateProvider: t.ctx.dateProvider! },
          t.genesis,
          t.dataDirFor('prover'),
          shouldCollectMetrics(),
        ));
      },
      beforeSubmit: async nodes => {
        await waitForNodesToSync(t, nodes);

        for (const node of nodes) {
          await node.setConfig({ minTxsPerBlock: 0 });
        }

        targetOraclePrice = (BigInt(10n ** 7n) * 1025n) / 1000n;
        await mockStateView.setEthPerFeeAsset(targetOraclePrice);
        t.logger.info(`Set uniswap price to ${targetOraclePrice}`);

        // Get initial on-chain price
        initialOnChainPrice = await rollup.getEthPerFeeAsset();
        t.logger.info(`Initial on-chain price: ${initialOnChainPrice}, target oracle price: ${targetOraclePrice}`);
      },
      afterVerify: async () => {
        await retryUntil(
          async () => {
            const currentPrice = await rollup.getEthPerFeeAsset();
            t.logger.info(`Current on-chain price: ${currentPrice}, waiting for: ${targetOraclePrice}`);
            return diffInBps(currentPrice, targetOraclePrice) == 0n;
          },
          'price convergence toward oracle',
          120, // timeout in seconds
          5, // check interval in seconds
        );

        const priceAfterFirstAlignment = await rollup.getEthPerFeeAsset();
        const targetOraclePrice2 = (BigInt(priceAfterFirstAlignment) * 995n) / 1000n;
        await mockStateView.setEthPerFeeAsset(targetOraclePrice2);
        t.logger.info(`Set uniswap price to ${targetOraclePrice}`);

        await retryUntil(
          async () => {
            const currentPrice = await rollup.getEthPerFeeAsset();
            t.logger.info(`Current on-chain price: ${currentPrice}, waiting for: ${targetOraclePrice2}`);
            return diffInBps(currentPrice, targetOraclePrice2) == 0n;
          },
          'price convergence toward oracle',
          120, // timeout in seconds
          5, // check interval in seconds
        );

        const finalPrice = await rollup.getEthPerFeeAsset();
        t.logger.info(`Final on-chain price: ${finalPrice}`);

        // Verify the price moved toward the oracle price
        expect(finalPrice).toBeGreaterThan(initialOnChainPrice);
        expect(diffInBps(finalPrice, targetOraclePrice2)).toBe(0n);
      },
    });
  });
});
