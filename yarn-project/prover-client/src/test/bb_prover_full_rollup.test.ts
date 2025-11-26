import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, PAIRING_POINTS_SIZE } from '@aztec/constants';
import { timesAsync } from '@aztec/foundation/collection';
import { parseBooleanEnv } from '@aztec/foundation/config';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { getTestData, isGenerateTestDataEnabled } from '@aztec/foundation/testing';
import { writeTestData } from '@aztec/foundation/testing/files';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { TestContext } from '../mocks/test_context.js';

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
          numL1ToL2Messages: NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
          makeProcessedTxOpts: (_, txIndex) => ({ privateOnly: txIndex % 2 === 0 }),
        }),
      );

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      context.orchestrator.startNewEpoch(1, numCheckpoints, finalBlobChallenges);

      for (let checkpointIndex = 0; checkpointIndex < numCheckpoints; checkpointIndex++) {
        const { constants, blocks, l1ToL2Messages, previousBlockHeader } = checkpoints[checkpointIndex];

        log.info(`Starting new checkpoint #${checkpointIndex}`);
        await context.orchestrator.startNewCheckpoint(
          checkpointIndex,
          constants,
          l1ToL2Messages,
          1,
          previousBlockHeader,
        );

        for (let i = 0; i < numBlockPerCheckpoint; i++) {
          const { header, txs } = blocks[i];
          const { blockNumber, timestamp } = header.globalVariables;

          log.info(`Starting new block #${blockNumber}`);
          await context.orchestrator.startNewBlock(blockNumber, timestamp, txs.length);
          await context.orchestrator.addTxs(txs);

          log.info(`Setting block as completed`);
          await context.orchestrator.setBlockCompleted(blockNumber, header);
        }
      }

      log.info(`Awaiting proofs`);
      const epochResult = await context.orchestrator.finalizeEpoch();

      if (prover) {
        // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13188): Handle the pairing point object without these hacks.
        epochResult.proof.numPublicInputs -= PAIRING_POINTS_SIZE;
        await expect(prover.verifyProof('RootRollupArtifact', epochResult.proof)).resolves.not.toThrow();
      }

      // Generate test data for the 1/1 blocks epoch scenario
      if (numCheckpoints === 1 && numBlockPerCheckpoint === 1 && isGenerateTestDataEnabled()) {
        const epochProof = getTestData('epochProofResult').at(-1);
        writeTestData(
          'yarn-project/end-to-end/src/fixtures/dumps/epoch_proof_result.json',
          JSON.stringify(epochProof!),
        );
      }
    },
    FAKE_PROOFS ? undefined : 900_000,
  );
});
