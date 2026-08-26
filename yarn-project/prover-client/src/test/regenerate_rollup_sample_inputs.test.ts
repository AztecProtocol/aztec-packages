import { MAX_L1_TO_L2_MSGS_PER_BLOCK } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { getTestData, isGenerateTestDataEnabled } from '@aztec/foundation/testing';
import { updateProtocolCircuitSampleInputs } from '@aztec/foundation/testing/files';
import type { CircuitName } from '@aztec/stdlib/stats';

import TOML from '@iarna/toml';

import { TestContext, makeTestDeferredJobQueue } from '../mocks/test_context.js';
import { CheckpointSubTreeOrchestrator } from '../orchestrator/checkpoint-sub-tree-orchestrator.js';
import { ChonkCache } from '../orchestrator/chonk-cache.js';
import { type CheckpointTopTreeData, TopTreeOrchestrator } from '../orchestrator/top-tree-orchestrator.js';

// Regenerates the committed `crates/rollup-*/Prover.toml` sample inputs that CI runs `nargo execute`
// against, for every rollup circuit at or above the transaction merge: the block-root variants, the
// block-merge, both checkpoint roots, the checkpoint-merge, the tx-merge, and the root rollup. The
// rollup circuits push their serialized inputs via `pushTestData` whenever they run through the
// prover, so driving representative epochs through the (simulated) orchestrator and then dumping
// `getTestData(circuitName)` produces fresh, ABI-current fixtures. Run with:
//   AZTEC_GENERATE_TEST_DATA=1 yarn workspace @aztec/prover-client test regenerate_rollup_sample_inputs
// Without that flag the whole suite is skipped, so it is a no-op (no prover setup) in normal CI. The
// `rollup-tx-base-private`/`rollup-tx-base-public` fixtures and the private-kernel fixtures depend on
// real client-proved transactions the simulated orchestrator cannot produce, so those are regenerated
// separately by the e2e `single-node/prover/server/full.test` dump instead.
//
// The scenarios are chosen to exercise each block-root variant the orchestrator selects (see
// BlockProvingState#getBlockRootRollupTypeAndInputs), which is picked by transaction count alone:
// 0 txs, 1 tx and >=2 txs. The three-block checkpoint also produces a block-merge and the three-
// checkpoint epoch a checkpoint-merge; a merge node only exists above the tree root, so both merges
// need three leaves — two would pair directly at the root. Single-block checkpoints feed the
// checkpoint-root-single-block circuit and multi-block checkpoints the (two-input) checkpoint-root
// circuit. A block with three txs merges its transaction base proofs through the tx-merge circuit
// before the (two-input) block root, whereas one- or two-tx blocks feed the block root directly, so a
// dedicated three-tx scenario is what regenerates the tx-merge sample. The samples for the variants
// that thread a start sponge from a previous block are taken from mid-checkpoint blocks, so those
// scenarios need a per-block message distribution. Every scenario also produces the root rollup.
const describeOrSkip = isGenerateTestDataEnabled() ? describe : describe.skip;

describeOrSkip('prover/regenerate-rollup-sample-inputs', () => {
  let context: TestContext;
  let log: Logger;

  interface Scenario {
    numCheckpoints: number;
    numBlocksPerCheckpoint: number;
    numTxsPerBlock: number | number[];
    numL1ToL2Messages: number;
    /**
     * Per-block message distribution. When set it overrides `numL1ToL2Messages`, letting a mid-checkpoint block
     * carry its own bundle.
     */
    l1ToL2MessagesPerBlock?: Fr[][];
    /** Circuits whose sample inputs this scenario is responsible for regenerating. */
    dump: CircuitName[];
  }

  // `makeCheckpoint` puts the scenario's whole message list into the first block, so the most a
  // scenario can carry is one full per-block bundle, not the per-checkpoint cap.
  const withMessages = MAX_L1_TO_L2_MSGS_PER_BLOCK;

  const scenarios: Scenario[] = [
    {
      numCheckpoints: 1,
      numBlocksPerCheckpoint: 1,
      numTxsPerBlock: 2,
      numL1ToL2Messages: withMessages,
      dump: ['rollup-checkpoint-root-single-block', 'rollup-root'],
    },
    {
      numCheckpoints: 1,
      numBlocksPerCheckpoint: 3,
      numTxsPerBlock: 1,
      numL1ToL2Messages: withMessages,
      dump: ['rollup-block-root-single-tx', 'rollup-block-merge', 'rollup-checkpoint-root'],
    },
    // Messages split across both blocks so the block-root sample is taken from a mid-checkpoint block with a
    // non-empty bundle, exercising the per-block sponge continuity asserts in the circuit.
    {
      numCheckpoints: 1,
      numBlocksPerCheckpoint: 2,
      numTxsPerBlock: 2,
      numL1ToL2Messages: 0, // Overridden by l1ToL2MessagesPerBlock.
      l1ToL2MessagesPerBlock: [times(2, i => new Fr(0xb00 + i)), times(3, i => new Fr(0xc00 + i))],
      dump: ['rollup-block-root'],
    },
    // Three txs in a block force a tx-merge to pair the base proofs down to the two the block root
    // takes; one- or two-tx blocks feed the block root directly and never exercise tx-merge.
    {
      numCheckpoints: 1,
      numBlocksPerCheckpoint: 1,
      numTxsPerBlock: 3,
      numL1ToL2Messages: withMessages,
      dump: ['rollup-tx-merge'],
    },
    // A mid-checkpoint block with no txs, carrying its own message bundle: the tx-less block root, sampled from a
    // position where both of its start sponges are inherited rather than initial.
    {
      numCheckpoints: 1,
      numBlocksPerCheckpoint: 2,
      numTxsPerBlock: [1, 0],
      numL1ToL2Messages: 0, // Overridden by l1ToL2MessagesPerBlock.
      l1ToL2MessagesPerBlock: [times(2, i => new Fr(0x900 + i)), times(3, i => new Fr(0xa00 + i))],
      dump: ['rollup-block-root-no-txs'],
    },
    // The checkpoint-merge only appears with three checkpoints. Independently-built checkpoints do
    // not carry the inbox message state forward, so this scenario runs with no L1-to-L2 messages and
    // a zero previous rolling hash, matching the multi-checkpoint case in top-tree-orchestrator.test.
    {
      numCheckpoints: 3,
      numBlocksPerCheckpoint: 1,
      numTxsPerBlock: 1,
      numL1ToL2Messages: 0,
      dump: ['rollup-checkpoint-merge'],
    },
  ];

  beforeEach(async () => {
    log = createLogger('prover-client:test:regenerate-rollup-sample-inputs');
    context = await TestContext.new(log, { proverCount: 1 });
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it.each(scenarios)(
    'regenerates $dump from an epoch with $numCheckpoints checkpoints, $numBlocksPerCheckpoint blocks, $numTxsPerBlock txs',
    async ({
      numCheckpoints,
      numBlocksPerCheckpoint,
      numTxsPerBlock,
      numL1ToL2Messages,
      l1ToL2MessagesPerBlock,
      dump,
    }) => {
      const makeProcessedTxOpts = (_: unknown, txIndex: number) => ({ privateOnly: txIndex % 2 === 0 });
      const checkpoints = await timesAsync(numCheckpoints, () =>
        l1ToL2MessagesPerBlock
          ? context.makeCheckpointWithMessagesPerBlock(l1ToL2MessagesPerBlock, { numTxsPerBlock, makeProcessedTxOpts })
          : context.makeCheckpoint(numBlocksPerCheckpoint, { numTxsPerBlock, numL1ToL2Messages, makeProcessedTxOpts }),
      );

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      const chonkCache = new ChonkCache();
      const subTrees: CheckpointSubTreeOrchestrator[] = [];
      const topTreeData: CheckpointTopTreeData[] = [];

      try {
        for (let checkpointIndex = 0; checkpointIndex < numCheckpoints; checkpointIndex++) {
          const {
            constants,
            blocks,
            l1ToL2MessageBundle,
            l1ToL2MessageBundlesPerBlock,
            previousBlockHeader,
            checkpoint,
          } = checkpoints[checkpointIndex];

          // First checkpoint starts from genesis; the multi-checkpoint scenario carries no messages,
          // so every checkpoint's previous rolling hash is zero.
          const previousInboxRollingHash = Fr.ZERO;

          const subTree = await CheckpointSubTreeOrchestrator.start(
            context.worldState,
            context.prover,
            EthAddress.ZERO,
            chonkCache,
            EpochNumber(1),
            /* cancelJobsOnStop */ false,
            makeTestDeferredJobQueue(),
            constants,
            l1ToL2MessageBundle,
            previousInboxRollingHash,
            numBlocksPerCheckpoint,
            previousBlockHeader,
          );
          subTrees.push(subTree);

          for (let i = 0; i < numBlocksPerCheckpoint; i++) {
            const { header, txs } = blocks[i];
            const { blockNumber, timestamp } = header.globalVariables;

            await subTree.startNewBlock(blockNumber, timestamp, txs.length, l1ToL2MessageBundlesPerBlock[i]);
            if (txs.length > 0) {
              await subTree.addTxs(txs);
            }
            await subTree.setBlockCompleted(blockNumber, header);
          }

          topTreeData.push({
            subTreeProofs: subTree
              .getSubTreeResult()
              .then(r => ({ blockProofOutputs: r.blockProofOutputs, inboxParityProof: r.inboxParityProof })),
            l2ToL1MsgsPerBlock: blocks.map(b => b.txs.map(tx => tx.txEffect.l2ToL1Msgs)),
            blobFields: checkpoint.toBlobFields(),
            previousBlockHeader,
            previousArchiveSiblingPath: subTree.getPreviousArchiveSiblingPath(),
          });
        }

        const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
        try {
          await topTree.prove(EpochNumber(1), numCheckpoints, finalBlobChallenges, topTreeData);
        } finally {
          await topTree.stop();
        }

        for (const circuitName of dump) {
          const data = getTestData(circuitName);
          if (!data || data.length === 0) {
            throw new Error(`No test data captured for ${circuitName}; scenario does not exercise it.`);
          }
          updateProtocolCircuitSampleInputs(circuitName, TOML.stringify(data[0] as any));
          log.info(`Regenerated sample inputs for ${circuitName}`);
        }
      } finally {
        await Promise.all(subTrees.map(s => s.stop()));
      }
    },
    300_000,
  );
});
