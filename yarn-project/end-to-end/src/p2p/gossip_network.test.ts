import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { waitForTx } from '@aztec/aztec.js/node';
import { TxHash } from '@aztec/aztec.js/tx';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Signature } from '@aztec/foundation/eth-signature';
import { retryUntil } from '@aztec/foundation/retry';
import type { SequencerClient } from '@aztec/sequencer-client';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { CheckpointAttestation, ConsensusPayload } from '@aztec/stdlib/p2p';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import {
  ATTESTER_PRIVATE_KEYS_START_INDEX,
  createNodes,
  createNonValidatorNode,
  createProverNode,
} from '../fixtures/setup_p2p_test.js';
import { type AlertConfig, GrafanaClient } from '../quality_of_service/grafana_client.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { submitTransactions } from './shared.js';

const CHECK_ALERTS = process.env.CHECK_ALERTS === 'true';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_VALIDATORS = 4;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = process.env.BOOT_NODE_UDP_PORT ? parseInt(process.env.BOOT_NODE_UDP_PORT) : 4500;
const AZTEC_SLOT_DURATION = 36;
const AZTEC_EPOCH_DURATION = 4;
const BLOCK_DURATION_MS = 16_000;

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

// Tests end-to-end gossip propagation with 4 validators, a fake prover node, and a non-validator
// monitoring node (alwaysReexecuteBlockProposals:true). Uses P2PNetworkTest with real libp2p,
// SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES (ethSlot=4s, aztecSlot=36s, epoch=4, proofSubEpochs=640),
// inboxLag=2. Asserts txs are mined from all nodes, attestation signers match the validator set,
// and the prover node produces a proven block by collecting txs from p2p.
describe('e2e_p2p_network', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let proverAztecNode: AztecNodeService;
  let monitoringNode: AztecNodeService;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_network',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      startProverNode: false, // we'll start our own using p2p
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        aztecEpochDuration: AZTEC_EPOCH_DURATION,
        blockDurationMs: BLOCK_DURATION_MS,
        slashingRoundSizeInEpochs: 2,
        slashingQuorum: 5,
        listenAddress: '127.0.0.1',
        inboxLag: 2,
      },
    });

    await t.setup();
    await t.applyBaseSetup();
  });

  afterEach(async () => {
    await tryStop(proverAztecNode);
    await tryStop(monitoringNode);
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

  // Stands up 4 validators + 1 prover + 1 re-execution monitor, submits 2 txs per node, and waits
  // for all txs to mine. Checks attestation signers match the validator set and confirms the prover
  // eventually produces a proven block (collecting txs from p2p rather than RPC).
  // REFACTOR: Promise.all over waitForTx calls is hand-rolled; extract to a shared helper
  it('should rollup txs from all peers', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    // create our network of nodes and submit txs into each of them
    // the number of txs per node and the number of txs per rollup
    // should be set so that the only way for rollups to be built
    // is if the txs are successfully gossiped around the nodes.
    const txsSentViaDifferentNodes: TxHash[][] = [];
    t.logger.info('Creating validator nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    // create a prover node that uses p2p only (not rpc) to gather txs to test prover tx collection
    t.logger.warn(`Creating prover node`);
    ({ proverNode: proverAztecNode } = await createProverNode(
      t.ctx.aztecNodeConfig,
      BOOT_NODE_UDP_PORT + NUM_VALIDATORS + 1,
      t.bootstrapNodeEnr,
      ATTESTER_PRIVATE_KEYS_START_INDEX + NUM_VALIDATORS + 1,
      { dateProvider: t.ctx.dateProvider },
      t.genesis,
      `${DATA_DIR}-prover`,
      shouldCollectMetrics(),
    ));

    t.logger.warn(`Creating non validator node`);
    const monitoringNodeConfig: AztecNodeConfig = { ...t.ctx.aztecNodeConfig, alwaysReexecuteBlockProposals: true };
    monitoringNode = await createNonValidatorNode(
      monitoringNodeConfig,
      t.ctx.dateProvider,
      BOOT_NODE_UDP_PORT + NUM_VALIDATORS + 2,
      t.bootstrapNodeEnr,
      t.genesis,
      `${DATA_DIR}-monitor`,
      shouldCollectMetrics(),
    );

    t.logger.info('Waiting for nodes to connect');
    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS);

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

    t.logger.info('Submitting transactions');
    for (const node of nodes) {
      const context = await submitTransactions(t.logger, node, NUM_TXS_PER_NODE, t.fundedAccount);
      txsSentViaDifferentNodes.push(context);
    }

    t.logger.info('Waiting for transactions to be mined');
    // now ensure that all txs were successfully mined
    await Promise.all(
      txsSentViaDifferentNodes.flatMap((txs, i) =>
        txs.map((txHash, j) => {
          t.logger.info(`Waiting for tx ${i}-${j}: ${txHash.toString()} to be mined`);
          return waitForTx(nodes[0], txHash, { timeout: WAIT_FOR_TX_TIMEOUT });
        }),
      ),
    );
    t.logger.info('All transactions mined');

    // Gather signers from attestations downloaded from L1
    const receipt = await nodes[0].getTxReceipt(txsSentViaDifferentNodes[0][0]);
    const blockNumber = receipt.blockNumber!;
    const dataStore = (nodes[0] as AztecNodeService).getBlockSource() as Archiver;
    const blockData = await dataStore.getBlockData({ number: BlockNumber(blockNumber) });
    const [publishedCheckpoint] = await dataStore.getCheckpoints({ from: blockData!.checkpointNumber, limit: 1 });
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

    // Ensure prover node did its job and collected txs from p2p
    await retryUntil(
      async () => {
        const provenBlock = await nodes[0].getBlockNumber('proven');
        return provenBlock > 0;
      },
      'proven block',
      SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES.aztecProofSubmissionEpochs * AZTEC_EPOCH_DURATION * AZTEC_SLOT_DURATION,
    );
  });
});
