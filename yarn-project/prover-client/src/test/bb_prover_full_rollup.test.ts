import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, PAIRING_POINTS_SIZE } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { timesParallel } from '@aztec/foundation/collection';
import { parseBooleanEnv } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { getTestData, isGenerateTestDataEnabled } from '@aztec/foundation/testing';
import { writeTestData } from '@aztec/foundation/testing/files';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { mockTx } from '@aztec/stdlib/testing';
import type { BlockHeader, ProcessedTx } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { buildBlockWithCleanDB } from '../block-factory/light.js';
import { makeGlobals } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';
import { buildBlobDataFromTxs } from '../orchestrator/block-building-helpers.js';

describe('prover/bb_prover/full-rollup', () => {
  const FAKE_PROOFS = parseBooleanEnv(process.env.FAKE_PROOFS);

  let context: TestContext;
  let previousBlockHeader: BlockHeader;
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
    previousBlockHeader = context.getPreviousBlockHeader();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it.each([
    [1, 1, 0], // Epoch with a single checkpoint and a block with no txs. Requires one padding checkpoint proof.
    // [2, 2, 0], // Epoch with two checkpoints // TODO(#10678) disabled for time x resource usage on main runner
    // [1, 2, 0], // Epoch with a checkpoint that has two blocks, requires one padding block proof; commented out to reduce running time
  ])(
    'proves a private-only epoch with %i/%i blocks with %i/%i non-empty txs each',
    async (numCheckpoints, numBlockPerCheckpoint, numTxsPerBlock) => {
      log.info(
        `Proving epoch with ${numCheckpoints} checkpoints and ${numBlockPerCheckpoint} blocks per checkpoint, with ${numTxsPerBlock} txs per block`,
      );

      const initialHeader = context.getBlockHeader(0);
      const txsPerCheckpoint: ProcessedTx[][][] = [];
      for (let checkpointIndex = 0; checkpointIndex < numCheckpoints; checkpointIndex++) {
        txsPerCheckpoint[checkpointIndex] = [];
        for (let i = 0; i < numBlockPerCheckpoint; i++) {
          const blockNum = checkpointIndex * numBlockPerCheckpoint + i + 1;
          const txs = await timesParallel(numTxsPerBlock, async (i: number) => {
            const txOpts = { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0 };
            const tx = await mockTx(blockNum * 100_000 + 1000 * (i + 1), txOpts);
            tx.data.constants.anchorBlockHeader = initialHeader;
            tx.data.constants.vkTreeRoot = getVKTreeRoot();
            return tx;
          });

          log.info(`Processing public functions`);
          const [processed, failed] = await context.processPublicFunctions(txs);
          expect(processed.length).toBe(numTxsPerBlock);
          expect(failed.length).toBe(0);
          txsPerCheckpoint[checkpointIndex].push(processed);
        }
      }

      const { blobFieldsLengths, finalBlobChallenges } = await buildBlobDataFromTxs(
        txsPerCheckpoint.map(txs => txs.flat()),
      );
      context.orchestrator.startNewEpoch(1, numCheckpoints, finalBlobChallenges);

      for (let checkpointIndex = 0; checkpointIndex < numCheckpoints; checkpointIndex++) {
        const checkpointConstants = context.getCheckpointConstants(checkpointIndex);
        const l1ToL2Messages = makeTuple(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, Fr.random);

        log.info(`Starting new checkpoint #${checkpointIndex}`);
        await context.orchestrator.startNewCheckpoint(
          checkpointIndex,
          checkpointConstants,
          l1ToL2Messages,
          1,
          blobFieldsLengths[checkpointIndex],
          previousBlockHeader,
        );

        for (let i = 0; i < numBlockPerCheckpoint; i++) {
          const blockNum = checkpointIndex * numBlockPerCheckpoint + i + 1;
          const globals = makeGlobals(blockNum, checkpointConstants.slotNumber.toNumber());
          const processed = txsPerCheckpoint[checkpointIndex][i];

          log.info(`Starting new block #${blockNum}`);
          await context.orchestrator.startNewBlock(blockNum, globals.timestamp, processed.length);
          await context.orchestrator.addTxs(processed);

          log.info(`Setting block as completed`);
          await context.orchestrator.setBlockCompleted(blockNum);

          log.info(`Updating world state with new block`);
          const block = await buildBlockWithCleanDB(
            processed,
            globals,
            l1ToL2Messages,
            await context.worldState.fork(),
          );
          previousBlockHeader = block.getBlockHeader();
          await context.worldState.handleL2BlockAndMessages(block, l1ToL2Messages);
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

  // TODO(@PhilWindle): Remove public functions and re-enable once we can handle empty tx slots
  it.skip('proves all circuits', async () => {
    const numTransactions = 4;
    const txs = await timesParallel(numTransactions, (i: number) =>
      mockTx(1000 * (i + 1), {
        numberOfNonRevertiblePublicCallRequests: 2,
        numberOfRevertiblePublicCallRequests: 1,
      }),
    );
    for (const tx of txs) {
      tx.data.constants.anchorBlockHeader = context.getBlockHeader(0);
    }

    const l1ToL2Messages = makeTuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>(
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      Fr.random,
    );

    const [processed, failed] = await context.processPublicFunctions(txs);

    expect(processed.length).toBe(numTransactions);
    expect(failed.length).toBe(0);

    const {
      blobFieldsLengths: [blobFieldsLength],
      finalBlobChallenges,
    } = await buildBlobDataFromTxs([processed]);

    context.orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
    await context.orchestrator.startNewCheckpoint(
      0, // checkpointIndex
      context.getCheckpointConstants(),
      l1ToL2Messages,
      1, // numBlocks
      blobFieldsLength,
      context.getPreviousBlockHeader(),
    );
    await context.orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, processed.length);

    await context.orchestrator.addTxs(processed);

    await context.orchestrator.setBlockCompleted(context.blockNumber);

    const result = await context.orchestrator.finalizeEpoch();
    if (prover) {
      await expect(prover.verifyProof('RootRollupArtifact', result.proof)).resolves.not.toThrow();
    }
  });
});
