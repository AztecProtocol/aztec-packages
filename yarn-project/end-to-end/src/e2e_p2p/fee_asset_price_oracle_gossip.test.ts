import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { RollupContract, STATE_VIEW_ADDRESS } from '@aztec/ethereum/contracts';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Signature } from '@aztec/foundation/eth-signature';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import type { SequencerClient } from '@aztec/sequencer-client';
import { CheckpointAttestation, ConsensusPayload } from '@aztec/stdlib/consensus';
import { tryStop } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { MNEMONIC, shouldCollectMetrics } from '../fixtures/fixtures.js';
import { ATTESTER_PRIVATE_KEYS_START_INDEX, createNodes, createProverNode } from '../fixtures/setup_p2p_test.js';
import { type AlertConfig, GrafanaClient } from '../quality_of_service/grafana_client.js';
import { MockStateView, diffInBps } from '../shared/mock_state_view.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES } from './p2p_network.js';

const CHECK_ALERTS = process.env.CHECK_ALERTS === 'true';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_VALIDATORS = 4;
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gossip-'));

jest.setTimeout(1000 * 60 * 10);

const qosAlerts: AlertConfig[] = [
  {
    alert: 'SequencerTimeToCollectAttestations',
    expr: 'aztec_sequencer_time_to_collect_attestations > 3500',
    labels: { severity: 'error' },
    for: '10m',
    annotations: {},
  },
];

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
        aztecSlotDuration: 24,
        aztecEpochDuration: 4,
        slashingRoundSizeInEpochs: 2,
        slashingQuorum: 5,
        listenAddress: '127.0.0.1',
        // Pipelining: target-slot is one ahead of build-slot; inboxLag sources L1->L2
        // messages from the previous checkpoint to avoid L1ToL2MessagesNotReadyError.
        inboxLag: 2,
      },
    });

    await t.setup();
    await t.applyBaseSetup();
  });

  afterEach(async () => {
    await tryStop(proverNode);
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  afterAll(async () => {
    if (CHECK_ALERTS) {
      const checker = new GrafanaClient(t.logger);
      await checker.runAlertCheck(qosAlerts);
    }
  });

  it('should rollup txs from all peers', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    const rollup = RollupContract.getFromL1ContractsValues(t.ctx.deployL1ContractsValues);

    const account = mnemonicToAccount(MNEMONIC, { addressIndex: 999 });
    const walletClient = createExtendedL1Client(t.ctx.aztecNodeConfig.l1RpcUrls, account, foundry);

    await t.ctx.ethCheatCodes.setBalance(account.address, 100n * 10n ** 18n);

    const mockStateView = await MockStateView.deploy(t.ctx.ethCheatCodes, walletClient, STATE_VIEW_ADDRESS);

    // The initial oracle price (default value) is 1e7
    await mockStateView.setEthPerFeeAsset(10n ** 7n);

    await t.ctx.ethCheatCodes.mineEmptyBlock();
    await t.ctx.ethCheatCodes.mine(10);
    await t.ctx.ethCheatCodes.mineEmptyBlock();

    t.logger.info('Creating validator nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider!,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    t.logger.warn(`Creating prover node`);
    ({ proverNode } = await createProverNode(
      { ...t.ctx.aztecNodeConfig, minTxsPerBlock: 0 },
      BOOT_NODE_UDP_PORT + NUM_VALIDATORS + 1,
      t.bootstrapNodeEnr,
      ATTESTER_PRIVATE_KEYS_START_INDEX + NUM_VALIDATORS + 1,
      { dateProvider: t.ctx.dateProvider! },
      t.genesis,
      `${DATA_DIR}-prover`,
      shouldCollectMetrics(),
    ));

    // wait a bit for peers to discover each other
    await sleep(8000);

    // We need to `createNodes` before we setup account, because
    // those nodes actually form the committee, and so we cannot build
    // blocks without them (since targetCommitteeSize is set to the number of nodes)
    await t.setupAccount();

    // Wait until the other nodes sync to the block from which we sent the tx
    const targetBlock = await t.ctx.aztecNode.getBlockNumber();
    t.logger.warn(`Waiting for all nodes to sync to block number ${targetBlock}`);
    await retryUntil(
      async () => {
        const blockNumbers = await Promise.all(nodes.map(node => node.getBlockNumber()));
        const checkpointNumber = (await t.monitor.run()).checkpointNumber;
        t.logger.info(`Current block numbers ${blockNumbers} (checkpoint number on L1 is ${checkpointNumber})`);
        return blockNumbers.every(bn => bn >= targetBlock);
      },
      `nodes to sync to block number ${targetBlock}`,
      30,
      0.5,
    );

    for (const node of nodes) {
      await node.setConfig({ minTxsPerBlock: 0 });
    }

    const targetOraclePrice = (BigInt(10n ** 7n) * 1025n) / 1000n;
    await mockStateView.setEthPerFeeAsset(targetOraclePrice);
    t.logger.info(`Set uniswap price to ${targetOraclePrice}`);

    // Get initial on-chain price
    const initialOnChainPrice = await rollup.getEthPerFeeAsset();
    t.logger.info(`Initial on-chain price: ${initialOnChainPrice}, target oracle price: ${targetOraclePrice}`);

    // Gather signers from attestations downloaded from L1. setupAccount() no longer sends a tx,
    // so when the test reaches here no checkpoint may have been published yet; wait for the
    // archiver to index the first published checkpoint before reading attestations.
    const dataStore = (nodes[0] as AztecNodeService).getBlockSource() as Archiver;
    t.logger.warn('Waiting for first checkpoint to be published and indexed by the archiver');
    const publishedCheckpoint = await retryUntil(
      async () => {
        const blockNumbers = await Promise.all(nodes.map(node => node.getBlockNumber()));
        const checkpointNumber = (await t.monitor.run()).checkpointNumber;
        t.logger.info(`Current block numbers ${blockNumbers} (checkpoint number on L1 is ${checkpointNumber})`);
        const [checkpoint] = await dataStore.getCheckpoints({ from: CheckpointNumber(1), limit: 1 });
        return checkpoint;
      },
      'published checkpoint to be indexed',
      120,
      1,
    );
    const signatureContext = {
      chainId: t.ctx.aztecNodeConfig.l1ChainId,
      rollupAddress: t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    };
    const payload = ConsensusPayload.fromCheckpoint(publishedCheckpoint.checkpoint, signatureContext);
    const attestations = publishedCheckpoint.attestations
      .filter(a => !a.signature.isEmpty())
      .map(a => new CheckpointAttestation(payload, a.signature, Signature.empty()));
    const signers = await Promise.all(attestations.map(att => att.getSender()!.toString()));
    t.logger.info(`Attestation signers`, { signers });

    // Check that the signers found are part of the proposer nodes to ensure the archiver fetched them right
    const validatorAddresses = nodes.flatMap(node =>
      ((node as AztecNodeService).getSequencer() as SequencerClient).validatorAddresses?.map(a => a.toString()),
    );
    t.logger.info(`Validator addresses`, { addresses: validatorAddresses });
    for (const signer of signers) {
      expect(validatorAddresses).toContain(signer);
    }

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
  });
});
