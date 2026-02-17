import type { AztecNodeService } from '@aztec/aztec-node';
import { createLogger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { Tx } from '@aztec/aztec.js/tx';
import { RollupContract } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../../fixtures/fixtures.js';
import { createNodes } from '../../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES, WAIT_FOR_TX_TIMEOUT } from '../p2p_network.js';
import { prepareTransactions } from '../shared.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
export const NUM_VALIDATORS = 6;
export const NUM_TXS_PER_NODE = 2;
export const BOOT_NODE_UDP_PORT = 4500;

export const createReqrespDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reqresp-'));

type ReqrespOptions = {
  disableStatusHandshake?: boolean;
};

export async function createReqrespTest(options: ReqrespOptions = {}): Promise<P2PNetworkTest> {
  const { disableStatusHandshake = false } = options;
  const t = await P2PNetworkTest.create({
    testName: 'e2e_p2p_reqresp_tx',
    numberOfNodes: 0,
    numberOfValidators: NUM_VALIDATORS,
    basePort: BOOT_NODE_UDP_PORT,
    // To collect metrics - run in aztec-packages `docker compose --profile metrics up`
    metricsPort: shouldCollectMetrics(),
    initialConfig: {
      ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
      aztecSlotDuration: 24,
      ...(disableStatusHandshake ? { p2pDisableStatusHandshake: true } : {}),
      listenAddress: '127.0.0.1',
      aztecEpochDuration: 64, // stable committee
    },
  });
  await t.setup();
  await t.applyBaseSetup();
  return t;
}

export async function cleanupReqrespTest(params: { t: P2PNetworkTest; nodes?: AztecNodeService[]; dataDir: string }) {
  const { t, nodes, dataDir } = params;
  if (nodes) {
    await t.stopNodes(nodes);
  }
  await t.teardown();
  for (let i = 0; i < NUM_VALIDATORS; i++) {
    fs.rmSync(`${dataDir}-${i}`, { recursive: true, force: true, maxRetries: 3 });
  }
}

const getNodePort = (nodeIndex: number) => BOOT_NODE_UDP_PORT + 1 + nodeIndex;

export async function runReqrespTxTest(params: {
  t: P2PNetworkTest;
  dataDir: string;
  disableStatusHandshake?: boolean;
}): Promise<AztecNodeService[]> {
  const { t, dataDir, disableStatusHandshake = false } = params;

  if (!t.bootstrapNodeEnr) {
    throw new Error('Bootstrap node ENR is not available');
  }

  t.logger.info('Creating nodes');
  const aztecNodeConfig = disableStatusHandshake
    ? { ...t.ctx.aztecNodeConfig, p2pDisableStatusHandshake: true }
    : t.ctx.aztecNodeConfig;

  const nodes = await createNodes(
    aztecNodeConfig,
    t.ctx.dateProvider,
    t.bootstrapNodeEnr,
    NUM_VALIDATORS,
    BOOT_NODE_UDP_PORT,
    t.prefilledPublicData,
    dataDir,
    shouldCollectMetrics(),
  );

  t.logger.info('Waiting for nodes to connect');
  await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS);

  await t.setupAccount();

  const targetBlockNumber = await t.ctx.aztecNodeService.getBlockNumber();
  await retryUntil(
    async () => {
      const blockNumbers = await Promise.all(nodes.map(node => node.getBlockNumber()));
      return blockNumbers.every(blockNumber => blockNumber >= targetBlockNumber) ? true : undefined;
    },
    `validators to sync to L2 block ${targetBlockNumber}`,
    60,
    0.5,
  );

  t.logger.info('Preparing transactions to send');
  const txBatches = await timesAsync(2, () =>
    prepareTransactions(t.logger, t.ctx.aztecNodeService, NUM_TXS_PER_NODE, t.fundedAccount),
  );

  t.logger.info('Removing initial node');
  await t.removeInitialNode();

  t.logger.info('Starting fresh slot');
  const [timestamp] = await t.ctx.cheatCodes.rollup.advanceToNextSlot();
  t.ctx.dateProvider.setTime(Number(timestamp) * 1000);
  const startSlotTimestamp = BigInt(timestamp);

  const { proposerIndexes, nodesToTurnOffTxGossip } = await getProposerIndexes(t, startSlotTimestamp);
  t.logger.info(`Turning off tx gossip for nodes: ${nodesToTurnOffTxGossip.map(getNodePort)}`);
  t.logger.info(`Sending txs to proposer nodes: ${proposerIndexes.map(getNodePort)}`);

  // Replace the p2p node implementation of some of the nodes with a spy such that it does not store transactions that are gossiped to it
  // Original implementation of `handleGossipedTx` will store received transactions in the tx pool.
  // We chose the first 2 nodes that will be the proposers for the next few slots
  for (const nodeIndex of nodesToTurnOffTxGossip) {
    const logger = createLogger(`p2p:${getNodePort(nodeIndex)}`);
    jest.spyOn((nodes[nodeIndex] as any).p2pClient.p2pService, 'handleGossipedTx').mockImplementation(((
      payloadData: Buffer,
    ) => {
      const txHash = Tx.fromBuffer(payloadData).getTxHash();
      logger.info(`Skipping storage of gossiped transaction ${txHash.toString()}`);
      return Promise.resolve();
    }) as any);
  }

  // We send the tx to the proposer nodes directly, ignoring the pxe and node in each context
  // We cannot just call tx.send since they were created using a pxe wired to the first node which is now stopped
  t.logger.info('Sending transactions through proposer nodes');
  const submittedTxs = await Promise.all(
    txBatches.map(async (batch, batchIndex) => {
      const proposerNode = nodes[proposerIndexes[batchIndex]];
      await Promise.all(
        batch.map(async tx => {
          try {
            await proposerNode.sendTx(tx);
          } catch (err) {
            t.logger.error(`Error sending tx: ${err}`);
            throw err;
          }
        }),
      );
      return batch.map(tx => ({ node: proposerNode, txHash: tx.getTxHash() }));
    }),
  );

  t.logger.info('Waiting for all transactions to be mined');
  await Promise.all(
    submittedTxs.flatMap((batch, batchIndex) =>
      batch.map(async (submittedTx, txIndex) => {
        t.logger.info(`Waiting for tx ${batchIndex}-${txIndex} ${submittedTx.txHash.toString()} to be mined`);
        await waitForTx(submittedTx.node, submittedTx.txHash, { timeout: WAIT_FOR_TX_TIMEOUT * 1.5 });
        t.logger.info(`Tx ${batchIndex}-${txIndex} ${submittedTx.txHash.toString()} has been mined`);
      }),
    ),
  );

  t.logger.info('All transactions mined');

  return nodes;
}

async function getProposerIndexes(t: P2PNetworkTest, startSlotTimestamp: bigint) {
  // Get the nodes for the next set of slots
  const rollupContract = new RollupContract(
    t.ctx.deployL1ContractsValues.l1Client,
    t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
  );

  const attesters = await rollupContract.getAttesters();
  const startSlot = await rollupContract.getSlotAt(startSlotTimestamp);

  const proposers = await Promise.all(
    Array.from({ length: 3 }, async (_, i) => {
      const slot = SlotNumber(startSlot + i);
      const slotTimestamp = await rollupContract.getTimestampForSlot(slot);
      return await rollupContract.getProposerAt(slotTimestamp);
    }),
  );
  // Get the indexes of the nodes that are responsible for the next two slots
  const proposerIndexes = proposers.map(proposer => attesters.findIndex(a => a.equals(proposer)));

  if (proposerIndexes.some(i => i === -1)) {
    throw new Error(
      `Proposer index not found for proposer ` +
        `(proposers=${proposers.map(p => p.toString()).join(',')}, indices=${proposerIndexes.join(',')})`,
    );
  }

  const nodesToTurnOffTxGossip = Array.from({ length: NUM_VALIDATORS }, (_, i) => i).filter(
    i => !proposerIndexes.includes(i),
  );
  return { proposerIndexes, nodesToTurnOffTxGossip };
}
