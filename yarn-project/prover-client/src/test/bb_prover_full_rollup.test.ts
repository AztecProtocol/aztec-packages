import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { MAX_L1_TO_L2_MSGS_PER_BLOCK, PAIRING_POINTS_SIZE } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { parseBooleanEnv } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { getTestData, isGenerateTestDataEnabled } from '@aztec/foundation/testing';
import { writeTestData } from '@aztec/foundation/testing/files';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { TestContext, makeTestDeferredJobQueue } from '../mocks/test_context.js';
import { CheckpointSubTreeOrchestrator } from '../orchestrator/checkpoint-sub-tree-orchestrator.js';
import { ChonkCache } from '../orchestrator/chonk-cache.js';
import { type CheckpointTopTreeData, TopTreeOrchestrator } from '../orchestrator/top-tree-orchestrator.js';

describe('prover/bb_prover/full-rollup', () => {
  const FAKE_PROOFS = parseBooleanEnv(process.env.FAKE_PROOFS);

  let context: TestContext;
  let prover: BBNativeRollupProver | undefined;
  let log: Logger;

  beforeEach(async () => {
    const buildProver = async (bbConfig: BBProverConfig) => {
      prover = await BBNativeRollupProver.new(bbConfig, getTelemetryClient());
      return prover;
    };
    log = createLogger('prover-client:test:bb-prover-full-rollup');
    context = await TestContext.new(log, {
      proverCount: 1,
      createProver: FAKE_PROOFS ? undefined : buildProver,
    });
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it.each([
    [1, 1, 0], // Epoch with a single checkpoint and a block with no txs. Requires one padding checkpoint proof.
    // [1, 2, 1], // Epoch with a single checkpoint, each has two blocks with 1 tx each. // TODO(#10678) disabled for time x resource usage on main runner
    // [2, 1, 0], // Epoch with two checkpoints, each has 1 empty block. Commented out to reduce running time.
  ])(
    'proves an epoch with %i checkpoints with %i blocks each with %i txs',
    async (numCheckpoints, numBlockPerCheckpoint, numTxsPerBlock) => {
      log.info(
        `Proving epoch with ${numCheckpoints} checkpoints and ${numBlockPerCheckpoint} blocks per checkpoint, with ${numTxsPerBlock} txs per block`,
      );

      const checkpoints = await timesAsync(numCheckpoints, () =>
        context.makeCheckpoint(numBlockPerCheckpoint, {
          numTxsPerBlock,
          // makeCheckpoint puts the whole message list into the first block, so cap at the per-block limit.
          numL1ToL2Messages: MAX_L1_TO_L2_MSGS_PER_BLOCK,
          makeProcessedTxOpts: (_, txIndex) => ({ privateOnly: txIndex % 2 === 0 }),
        }),
      );

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      const chonkCache = new ChonkCache();
      const subTrees: CheckpointSubTreeOrchestrator[] = [];
      const topTreeData: CheckpointTopTreeData[] = [];

      try {
        // Drive each checkpoint through its own sub-tree, mirroring the production
        // CheckpointProver flow. The top tree starts proving as each sub-tree completes.
        for (let checkpointIndex = 0; checkpointIndex < numCheckpoints; checkpointIndex++) {
          const { constants, blocks, l1ToL2Messages, l1ToL2MessageBundle, previousBlockHeader, checkpoint } =
            checkpoints[checkpointIndex];

          const previousInboxRollingHash =
            checkpointIndex === 0 ? Fr.ZERO : checkpoints[checkpointIndex - 1].checkpoint.header.inboxRollingHash;

          log.info(`Starting new checkpoint #${checkpointIndex}`);
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
            numBlockPerCheckpoint,
            previousBlockHeader,
          );
          subTrees.push(subTree);

          for (let i = 0; i < numBlockPerCheckpoint; i++) {
            const { header, txs } = blocks[i];
            const { blockNumber, timestamp } = header.globalVariables;

            log.info(`Starting new block #${blockNumber}`);
            await subTree.startNewBlock(blockNumber, timestamp, txs.length, i === 0 ? l1ToL2Messages : []);
            if (txs.length > 0) {
              await subTree.addTxs(txs);
            }

            log.info(`Setting block as completed`);
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

        log.info(`Awaiting top-tree proof`);
        const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
        let epochResult;
        try {
          epochResult = await topTree.prove(EpochNumber(1), numCheckpoints, finalBlobChallenges, topTreeData);
        } finally {
          await topTree.stop();
        }

        if (prover) {
          // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13188): Handle the pairing point object without these hacks.
          epochResult.proof.numPublicInputs -= PAIRING_POINTS_SIZE;
          await expect(prover.verifyProof('RootRollupArtifact', epochResult.proof)).resolves.not.toThrow();
        }

        // Generate test data for the 1/1 blocks epoch scenario.
        if (numCheckpoints === 1 && numBlockPerCheckpoint === 1 && isGenerateTestDataEnabled()) {
          const epochProof = getTestData('epochProofResult').at(-1);
          writeTestData(
            'yarn-project/end-to-end/src/fixtures/dumps/epoch_proof_result.json',
            JSON.stringify(epochProof!),
          );
        }
      } finally {
        await Promise.all(subTrees.map(s => s.stop()));
      }
    },
    FAKE_PROOFS ? undefined : 900_000,
  );
});
