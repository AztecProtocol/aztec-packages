import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { BatchedBlob, Blob } from '@aztec/blob-lib';
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
import type { BlockHeader } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { buildBlockWithCleanDB } from '../block-factory/light.js';
import { makeGlobals } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';

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
    context = await TestContext.new(log, 1, FAKE_PROOFS ? undefined : buildProver);
    previousBlockHeader = context.getPreviousBlockHeader();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it.each([
    [1, 1, 0, 2], // Epoch with a single block, requires one padding block proof
    // [2, 2, 0, 2], // Full epoch with two blocks // TODO(#10678) disabled for time x resource usage on main runner // NOTE: we need this test to create the fixture for integration_proof_verification.test.ts, which doesn't seem to be run, though does pass
    // [2, 3, 0, 2], // Epoch with two blocks but the block merge tree was assembled as with 3 leaves, requires one padding block proof; commented out to reduce running time
  ])(
    'proves a private-only epoch with %i/%i blocks with %i/%i non-empty txs each',
    async (blockCount, totalBlocks, nonEmptyTxs, totalTxs) => {
      log.info(`Proving epoch with ${blockCount}/${totalBlocks} blocks with ${nonEmptyTxs}/${totalTxs} non-empty txs`);

      const initialHeader = context.getBlockHeader(0);
      const processedTxs = [];
      const blobs = [];
      for (let blockNum = 1; blockNum <= blockCount; blockNum++) {
        const txs = await timesParallel(nonEmptyTxs, async (i: number) => {
          const txOpts = { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0 };
          const tx = await mockTx(blockNum * 100_000 + 1000 * (i + 1), txOpts);
          tx.data.constants.historicalHeader = initialHeader;
          tx.data.constants.vkTreeRoot = getVKTreeRoot();
          return tx;
        });

        log.info(`Processing public functions`);
        const [processed, failed] = await context.processPublicFunctions(txs, nonEmptyTxs);
        expect(processed.length).toBe(nonEmptyTxs);
        expect(failed.length).toBe(0);
        processedTxs[blockNum] = processed;
        blobs.push(await Blob.getBlobsPerBlock(processed.flatMap(tx => tx.txEffect.toBlobFields())));
      }

      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs.flat());
      context.orchestrator.startNewEpoch(1, 1, totalBlocks, finalBlobChallenges);

      for (let blockNum = 1; blockNum <= blockCount; blockNum++) {
        const globals = makeGlobals(blockNum);
        const l1ToL2Messages = makeTuple(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, Fr.random);
        const processed = processedTxs[blockNum];

        log.info(`Starting new block #${blockNum}`);

        await context.orchestrator.startNewBlock(globals, l1ToL2Messages, previousBlockHeader);
        await context.orchestrator.addTxs(processed);

        log.info(`Setting block as completed`);
        await context.orchestrator.setBlockCompleted(blockNum);

        log.info(`Updating world state with new block`);
        const block = await buildBlockWithCleanDB(processed, globals, l1ToL2Messages, await context.worldState.fork());
        previousBlockHeader = block.header;
        await context.worldState.handleL2BlockAndMessages(block, l1ToL2Messages);
      }

      log.info(`Awaiting proofs`);
      const epochResult = await context.orchestrator.finalizeEpoch();

      if (prover) {
        // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13188): Handle the pairing point object without these hacks.
        epochResult.proof.numPublicInputs -= PAIRING_POINTS_SIZE;
        await expect(prover.verifyProof('RootRollupArtifact', epochResult.proof)).resolves.not.toThrow();
      }

      // Generate test data for the 2/2 blocks epoch scenario
      if (blockCount === 2 && totalBlocks === 2 && isGenerateTestDataEnabled()) {
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
      tx.data.constants.historicalHeader = context.getBlockHeader(0);
    }

    const l1ToL2Messages = makeTuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>(
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      Fr.random,
    );

    const [processed, failed] = await context.processPublicFunctions(txs, numTransactions);

    expect(processed.length).toBe(numTransactions);
    expect(failed.length).toBe(0);

    const blobs = await Blob.getBlobsPerBlock(processed.map(tx => tx.txEffect.toBlobFields()).flat());
    const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

    context.orchestrator.startNewEpoch(1, 1, 1, finalBlobChallenges);

    await context.orchestrator.startNewBlock(context.globalVariables, l1ToL2Messages, context.getPreviousBlockHeader());

    await context.orchestrator.addTxs(processed);

    await context.orchestrator.setBlockCompleted(context.blockNumber);

    const result = await context.orchestrator.finalizeEpoch();
    if (prover) {
      await expect(prover.verifyProof('RootRollupArtifact', result.proof)).resolves.not.toThrow();
    }
  });
});
