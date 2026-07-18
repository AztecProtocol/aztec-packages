import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
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
// against. The rollup circuits push their serialized inputs via `pushTestData` whenever they run
// through the prover, so driving representative epochs through the (simulated) orchestrator and then
// dumping `getTestData(circuitName)` produces fresh, ABI-current fixtures. Run with:
//   AZTEC_GENERATE_TEST_DATA=1 yarn workspace @aztec/prover-client test regenerate_rollup_sample_inputs
// Without that flag the whole suite is skipped, so it is a no-op (no prover setup) in normal CI.
//
// The scenarios are chosen to exercise each block-root variant the orchestrator selects (see
// BlockProvingState#getBlockRootRollupTypeAndInputs): a first block with 0 txs, with >=2 txs, and
// with 1 tx; non-first blocks with 1 tx (from the three-block checkpoint) and with >=2 txs (from the
// two-block checkpoint). The three-block checkpoint also produces a block-merge and the three-
// checkpoint epoch a checkpoint-merge; a merge node only exists above the tree root, so both merges
// need three leaves — two would pair directly at the root. Single-block checkpoints feed the
// checkpoint-root-single-block circuit and multi-block checkpoints the (two-input) checkpoint-root
// circuit. Every scenario also produces the root rollup.
const describeOrSkip = isGenerateTestDataEnabled() ? describe : describe.skip;

describeOrSkip('prover/regenerate-rollup-sample-inputs', () => {
  let context: TestContext;
  let log: Logger;

  interface Scenario {
    numCheckpoints: number;
    numBlocksPerCheckpoint: number;
    numTxsPerBlock: number;
    numL1ToL2Messages: number;
    /** Circuits whose sample inputs this scenario is responsible for regenerating. */
    dump: CircuitName[];
  }

  const withMessages = NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP;

  const scenarios: Scenario[] = [
    {
      numCheckpoints: 1,
      numBlocksPerCheckpoint: 1,
      numTxsPerBlock: 0,
      numL1ToL2Messages: withMessages,
      dump: ['rollup-block-root-first-empty-tx'],
    },
    {
      numCheckpoints: 1,
      numBlocksPerCheckpoint: 1,
      numTxsPerBlock: 2,
      numL1ToL2Messages: withMessages,
      dump: ['rollup-block-root-first', 'rollup-checkpoint-root-single-block', 'rollup-root'],
    },
    {
      numCheckpoints: 1,
      numBlocksPerCheckpoint: 3,
      numTxsPerBlock: 1,
      numL1ToL2Messages: withMessages,
      dump: [
        'rollup-block-root-first-single-tx',
        'rollup-block-root-single-tx',
        'rollup-block-merge',
        'rollup-checkpoint-root',
      ],
    },
    {
      numCheckpoints: 1,
      numBlocksPerCheckpoint: 2,
      numTxsPerBlock: 2,
      numL1ToL2Messages: withMessages,
      dump: ['rollup-block-root'],
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
    async ({ numCheckpoints, numBlocksPerCheckpoint, numTxsPerBlock, numL1ToL2Messages, dump }) => {
      const checkpoints = await timesAsync(numCheckpoints, () =>
        context.makeCheckpoint(numBlocksPerCheckpoint, {
          numTxsPerBlock,
          numL1ToL2Messages,
          makeProcessedTxOpts: (_, txIndex) => ({ privateOnly: txIndex % 2 === 0 }),
        }),
      );

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      const chonkCache = new ChonkCache();
      const subTrees: CheckpointSubTreeOrchestrator[] = [];
      const topTreeData: CheckpointTopTreeData[] = [];

      try {
        for (let checkpointIndex = 0; checkpointIndex < numCheckpoints; checkpointIndex++) {
          const { constants, blocks, l1ToL2Messages, previousBlockHeader, checkpoint } = checkpoints[checkpointIndex];

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
            l1ToL2Messages,
            previousInboxRollingHash,
            numBlocksPerCheckpoint,
            previousBlockHeader,
          );
          subTrees.push(subTree);

          for (let i = 0; i < numBlocksPerCheckpoint; i++) {
            const { header, txs } = blocks[i];
            const { blockNumber, timestamp } = header.globalVariables;

            await subTree.startNewBlock(blockNumber, timestamp, txs.length, i === 0 ? l1ToL2Messages : []);
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
