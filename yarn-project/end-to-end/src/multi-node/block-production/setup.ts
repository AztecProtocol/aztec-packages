import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
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

import { sendL1ToL2Message } from '../../fixtures/l1_to_l2_messaging.js';
import { testSpan } from '../../fixtures/timing.js';
import type { EndToEndContext } from '../../fixtures/utils.js';
import { waitForBlockNumber, waitForTxs } from '../../fixtures/wait_helpers.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { proveInteraction } from '../../test-wallet/utils.js';
import {
  type BlockProposedEvent,
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MULTI_VALIDATOR_BLOCK_PRODUCTION_TIMING,
  MultiNodeTestContext,
  type MultiNodeTestOpts,
  type RegisteredValidator,
  type TrackedSequencerEvent,
  WIDE_SLOT_TIMING,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 20);

export const NODE_COUNT = 4;

// Send enough transactions to trigger multiple blocks within a checkpoint assuming 2 txs per block.
// If we start including txs at the 2nd block of a checkpoint, we can ensure a 3-block checkpoint
// if we produce 10 txs:
// - Checkpoint 1: Block 1 (0 txs), Block 2 (2 txs), Block 3 (2 txs)
// - Checkpoint 2: Block 1 (2 txs), Block 2 (2 txs), Block 3 (2 txs)
export const TX_COUNT = 10;

/** The validator cluster + context produced by {@link setupSimpleBlockProduction}. */
export type SimpleBlockProductionFixture = {
  test: MultiNodeTestContext;
  context: EndToEndContext;
  logger: Logger;
  validators: RegisteredValidator[];
  nodes: AztecNodeService[];
  from: AztecAddress;
};

/** State shared by the wide-slot `it`s (handles 4 validators + prover + a wallet pointed at node 0). */
export type BlockProductionWithProverFixture = {
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

/** Per-validator node config, or a function deriving it from the validator's 0-based index. */
type ValidatorNodeOpts = Partial<AztecNodeConfig> & { dontStartSequencer?: boolean };

/** Shared spine: builds N mock-gossip validators, sets up the context, spawns one node per validator. */
async function buildValidatorCluster(opts: {
  nodeCount: number;
  setupOpts: Partial<MultiNodeTestOpts>;
  nodeOpts?: ValidatorNodeOpts | ((index: number) => ValidatorNodeOpts);
}): Promise<SimpleBlockProductionFixture> {
  const validators = buildMockGossipValidators(opts.nodeCount);

  const test = await MultiNodeTestContext.setup({
    ...opts.setupOpts,
    initialValidators: validators,
  });

  const { context, logger } = test;
  const from = context.accounts[0];

  logger.warn(`Initial setup complete. Starting ${opts.nodeCount} validator nodes.`);
  const nodes = await asyncMap(validators, ({ privateKey }, i) =>
    test.createValidatorNode(
      [privateKey],
      typeof opts.nodeOpts === 'function' ? opts.nodeOpts(i) : { ...opts.nodeOpts },
    ),
  );
  logger.warn(`Started ${opts.nodeCount} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

  return { test, context, logger, validators, nodes, from };
}

/**
 * Stands up the `block-production` validator cluster shared by the `MULTI_VALIDATOR_BLOCK_PRODUCTION_TIMING` tests
 * (`simple`, `high_tps`): builds `nodeCount` mock-gossip validators, sets up the context with the
 * block-production timing profile, spawns one validator node per validator, and returns the cluster. The
 * per-test divergence (`fakeProcessingDelayPerTxMs`, `txDelayerMaxInclusionTimeIntoSlot`,
 * min/maxTxsPerBlock, whether sequencers start eagerly, contract type) passes through `opts`. Mirrors
 * how {@link setupBlockProductionWithProver} factors out the prover-backed setup; the test still registers its own contract.
 */
export function setupSimpleBlockProduction(opts: {
  nodeCount: number;
  setupOpts?: Partial<MultiNodeTestOpts>;
  nodeOpts?: Partial<AztecNodeConfig> & { dontStartSequencer?: boolean };
}): Promise<SimpleBlockProductionFixture> {
  return buildValidatorCluster({
    nodeCount: opts.nodeCount,
    setupOpts: { ...MOCK_GOSSIP_MULTI_VALIDATOR_OPTS, ...MULTI_VALIDATOR_BLOCK_PRODUCTION_TIMING, ...opts.setupOpts },
    nodeOpts: opts.nodeOpts,
  });
}

/**
 * Creates validators and sets up a wide-slot test context with the pipelining timing profile and a prover
 * node, then starts (paused) validator nodes and points the wallet at node 0. Mirrors the per-test
 * setup from the dissolved `mbps.parallel` file. The blob-promotion and pipeline-prune suites layer their
 * adverse-network shape on via `mockGossipSubNetworkLatency`, `maxTxsPerCheckpoint`, `clearInheritedCoinbase`,
 * and `disableCheckpointPromotionOnFirstNode`.
 */
export async function setupBlockProductionWithProver(opts: {
  syncChainTip: 'proposed' | 'checkpointed';
  minTxsPerBlock?: number;
  maxTxsPerBlock?: number;
  maxTxsPerCheckpoint?: number;
  buildCheckpointIfEmpty?: boolean;
  skipPushProposedBlocksToArchiver?: boolean;
  /** Injects artificial mock-gossip propagation latency (ms) to model adverse network conditions. */
  mockGossipSubNetworkLatency?: number;
  /** Clears each validator node's inherited coinbase so it derives one from its own attester key. */
  clearInheritedCoinbase?: boolean;
  /**
   * Disables checkpoint promotion on node 0 (`skipPromoteProposedCheckpointDuringL1Sync`), so node 0 fetches
   * blobs during L1 sync while its peers promote their own proposed checkpoints and skip the blob fetch.
   */
  disableCheckpointPromotionOnFirstNode?: boolean;
}): Promise<BlockProductionWithProverFixture> {
  const {
    syncChainTip = 'checkpointed',
    clearInheritedCoinbase = false,
    disableCheckpointPromotionOnFirstNode = false,
    ...setupOpts
  } = opts;

  // WIDE_SLOT_TIMING is the wide 72s/12s pipelining cadence (see A-914 on why the tighter 36s/4s breaks
  // non-proposer nodes); the JSDoc on the profile carries the full rationale.
  const { test, context, logger, validators, nodes, from } = await buildValidatorCluster({
    nodeCount: NODE_COUNT,
    setupOpts: {
      ...WIDE_SLOT_TIMING,
      numberOfAccounts: 0,
      mockGossipSubNetwork: true,
      startProverNode: true,
      ...setupOpts,
      pxeOpts: { syncChainTip },
      skipInitialSequencer: true,
    },
    nodeOpts: (index: number) => ({
      dontStartSequencer: true,
      ...(clearInheritedCoinbase ? { coinbase: undefined } : {}),
      ...(disableCheckpointPromotionOnFirstNode && index === 0
        ? { skipPromoteProposedCheckpointDuringL1Sync: true }
        : {}),
    }),
  });

  const { rollup } = test;
  const wallet = context.wallet as TestWallet;
  const { failEvents } = test.watchNodeSequencerEvents(nodes);

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

/** Waits until a specific multi-block checkpoint is proven, verifying that proving succeeds with multiple-blocks-per-slot. */
export async function waitForProvenCheckpoint(
  fixture: BlockProductionWithProverFixture,
  targetCheckpoint: CheckpointNumber,
) {
  const { test, nodes, logger, failEvents } = fixture;
  test.assertNoFailuresFromSequencers(failEvents);

  logger.warn(`Stopping validator sequencers before waiting for checkpoint ${targetCheckpoint} to be proven`);
  await Promise.all(nodes.map(n => n.getSequencer()?.stop()));

  // With the sequencers stopped, no further blocks are produced, so waiting out the rest of the epoch in
  // wall-clock is dead time. Warp the L1 clock forward past the epoch boundary so the epoch containing
  // targetCheckpoint closes and the fake prover can prove+submit it; the subsequent wait then only covers
  // the (real-time) proving+submission. A single next-epoch jump stays inside the proof-submission window
  // (proofSubmissionEpochs >= 1), so it never crosses the submission deadline. Skipped if already proven,
  // and forward-only since advanceToNextEpoch never rewinds.
  const { proven } = await test.context.cheatCodes.rollup.getTips();
  if (proven < targetCheckpoint) {
    await testSpan('warp:proven-checkpoint-epoch', () => test.context.cheatCodes.rollup.advanceToNextEpoch());
  }

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
  WIDE_SLOT_TIMING,
  MULTI_VALIDATOR_BLOCK_PRODUCTION_TIMING,
  MultiNodeTestContext,
  type RegisteredValidator,
  type TrackedSequencerEvent,
  buildMockGossipValidators,
};
