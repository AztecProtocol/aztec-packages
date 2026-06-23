import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { isL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import { waitForTx } from '@aztec/aztec.js/node';
import { RollupContract } from '@aztec/ethereum/contracts';
import { waitUntilL1Timestamp } from '@aztec/ethereum/l1-tx-utils';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { SequencerEvents } from '@aztec/sequencer-client';
import { getSlotAtTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import { TxStatus } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { sendL1ToL2Message } from '../../../fixtures/l1_to_l2_messaging.js';
import type { EndToEndContext } from '../../../fixtures/utils.js';
import { waitForBlockNumber, waitForTxs } from '../../../fixtures/wait_helpers.js';
import type { TestWallet } from '../../../test-wallet/test_wallet.js';
import { proveInteraction } from '../../../test-wallet/utils.js';
import {
  type BlockProposedEvent,
  MBPS_TIMING,
  MultiNodeTestContext,
  type RegisteredValidator,
  type TrackedSequencerEvent,
  buildMockGossipValidators,
} from '../../multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 20);

export const NODE_COUNT = 4;

// Send enough transactions to trigger multiple blocks within a checkpoint assuming 2 txs per block.
// If we start including txs at the 2nd block of a checkpoint, we can ensure a 3-block checkpoint
// if we produce 10 txs:
// - Checkpoint 1: Block 1 (0 txs), Block 2 (2 txs), Block 3 (2 txs)
// - Checkpoint 2: Block 1 (2 txs), Block 2 (2 txs), Block 3 (2 txs)
export const TX_COUNT = 10;

/** State shared by the MBPS-timing `it`s (handles 4 validators + prover + a wallet pointed at node 0). */
export type MbpsFixture = {
  test: MultiNodeTestContext;
  context: EndToEndContext;
  logger: Logger;
  rollup: RollupContract;
  archiver: Archiver;
  validators: RegisteredValidator[];
  nodes: AztecNodeService[];
  contract: TestContract;
  wallet: TestWallet;
  from: AztecAddress;
  failEvents: TrackedSequencerEvent[];
};

/**
 * Creates validators and sets up an MBPS test context with the pipelining timing profile and a prover
 * node, then starts (paused) validator nodes and points the wallet at node 0. Mirrors the per-test
 * setup from the dissolved `mbps.parallel` file.
 */
export async function setupMbps(opts: {
  syncChainTip: 'proposed' | 'checkpointed';
  minTxsPerBlock?: number;
  maxTxsPerBlock?: number;
  buildCheckpointIfEmpty?: boolean;
  skipPushProposedBlocksToArchiver?: boolean;
}): Promise<MbpsFixture> {
  const { syncChainTip = 'checkpointed', ...setupOpts } = opts;

  const validators = buildMockGossipValidators(NODE_COUNT);

  // MBPS_TIMING is the wide 72s/12s pipelining cadence (see A-914 on why the tighter 36s/4s breaks
  // non-proposer nodes); the JSDoc on the profile carries the full rationale.
  const test = await MultiNodeTestContext.setup({
    ...MBPS_TIMING,
    numberOfAccounts: 0,
    initialValidators: validators,
    mockGossipSubNetwork: true,
    startProverNode: true,
    // Additional options (minTxsPerBlock, maxTxsPerBlock, etc.)
    ...setupOpts,
    // PXE options for chain tip syncing
    pxeOpts: { syncChainTip },
    skipInitialSequencer: true,
    inboxLag: 2,
  });

  const { context, logger, rollup } = test;
  const wallet = context.wallet as TestWallet;
  const from = context.accounts[0]; // auto-created by setup

  // Start the validator nodes
  logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
  const nodes = await asyncMap(validators, ({ privateKey }) =>
    test.createValidatorNode([privateKey], { dontStartSequencer: true }),
  );
  logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });
  const { failEvents } = test.watchSequencerEvents(
    nodes.map(n => n.getSequencer()!),
    i => ({ validator: validators[i].attester }),
  );

  // Point the wallet at a validator node. The initial node-0 has all validator keys in its config,
  // so it rejects block proposals from validators thinking they come from itself. By redirecting
  // the wallet to a validator node, the PXE correctly tracks proposed blocks.
  wallet.updateNode(nodes[0]);
  const archiver = nodes[0].getBlockSource() as Archiver;

  // Register contract for sending txs.
  const contract = await test.registerTestContract(wallet);
  logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });

  return { test, context, logger, rollup, archiver, validators, nodes, contract, wallet, from, failEvents };
}

/** Retrieves all checkpoints from the archiver, checks that one has the target block count, and returns its number. */
export async function assertMultipleBlocksPerSlot(
  fixture: MbpsFixture,
  targetBlockCount: number,
): Promise<CheckpointNumber> {
  const { test, archiver, logger } = fixture;
  // Wait for the first validator's archiver to index a checkpoint with the target block count.
  // waitForTx polls the initial setup node, but this archiver belongs to nodes[0] (the first
  // validator). They sync L1 independently, so there's a race window of ~200-400ms.
  const waitTimeout = test.L2_SLOT_DURATION_IN_S * 3;
  await retryUntil(
    async () => {
      const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
      return checkpoints.some(pc => pc.checkpoint.blocks.length >= targetBlockCount) || undefined;
    },
    `checkpoint with at least ${targetBlockCount} blocks`,
    waitTimeout,
    0.5,
  );

  const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
  logger.warn(`Retrieved ${checkpoints.length} checkpoints from archiver`, {
    checkpoints: checkpoints.map(pc => pc.checkpoint.getStats()),
  });

  let expectedBlockNumber = checkpoints[0].checkpoint.blocks[0].number;
  let multiBlockCheckpointNumber: CheckpointNumber | undefined;

  for (const checkpoint of checkpoints) {
    const blockCount = checkpoint.checkpoint.blocks.length;
    if (blockCount >= targetBlockCount && multiBlockCheckpointNumber === undefined) {
      multiBlockCheckpointNumber = checkpoint.checkpoint.number;
    }
    logger.warn(`Checkpoint ${checkpoint.checkpoint.number} has ${blockCount} blocks`, {
      checkpoint: checkpoint.checkpoint.getStats(),
    });

    for (let i = 0; i < blockCount; i++) {
      const block = checkpoint.checkpoint.blocks[i];
      expect(block.indexWithinCheckpoint).toBe(i);
      expect(block.checkpointNumber).toBe(checkpoint.checkpoint.number);
      expect(block.number).toBe(expectedBlockNumber);
      expectedBlockNumber++;
    }
  }

  expect(multiBlockCheckpointNumber).toBeDefined();
  return multiBlockCheckpointNumber!;
}

/** Waits until a specific multi-block checkpoint is proven, verifying that proving succeeds with MBPS blocks. */
export async function waitForProvenCheckpoint(fixture: MbpsFixture, targetCheckpoint: CheckpointNumber) {
  const { test, nodes, logger, failEvents } = fixture;
  test.assertNoFailuresFromSequencers(failEvents);

  logger.warn(`Stopping validator sequencers before waiting for checkpoint ${targetCheckpoint} to be proven`);
  await Promise.all(nodes.map(n => n.getSequencer()?.stop()));

  const provenTimeout = test.L2_SLOT_DURATION_IN_S * test.epochDuration * 4;
  logger.warn(`Waiting for checkpoint ${targetCheckpoint} to be proven (timeout=${provenTimeout}s)`);
  await test.waitUntilProvenCheckpointNumber(targetCheckpoint, provenTimeout);
  logger.warn(`Proven checkpoint advanced to ${test.monitor.provenCheckpointNumber}`);
}

export {
  type Archiver,
  type AztecNodeConfig,
  type AztecNodeService,
  AztecAddress,
  EthAddress,
  NO_WAIT,
  generateClaimSecret,
  Fr,
  type Logger,
  isL1ToL2MessageReady,
  waitForTx,
  RollupContract,
  waitUntilL1Timestamp,
  asyncMap,
  BlockNumber,
  CheckpointNumber,
  SlotNumber,
  timesAsync,
  retryUntil,
  sleep,
  executeTimeout,
  TestContract,
  type SequencerEvents,
  getSlotAtTimestamp,
  getTimestampForSlot,
  GasFees,
  TxStatus,
  jest,
  sendL1ToL2Message,
  type EndToEndContext,
  waitForBlockNumber,
  waitForTxs,
  type TestWallet,
  proveInteraction,
  type BlockProposedEvent,
  MBPS_TIMING,
  MultiNodeTestContext,
  type RegisteredValidator,
  type TrackedSequencerEvent,
  buildMockGossipValidators,
};
