import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { mockTx } from '@aztec/circuit-types';
import { Fr, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { getTestData, isGenerateTestDataEnabled, writeTestData } from '@aztec/foundation/testing';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { buildBlock } from '../block_builder/light.js';
import { makeGlobals } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';

describe('prover/bb_prover/full-rollup', () => {
  let context: TestContext;
  let prover: BBNativeRollupProver;
  let log: DebugLogger;

  beforeEach(async () => {
    const buildProver = async (bbConfig: BBProverConfig) => {
      prover = await BBNativeRollupProver.new(bbConfig, new NoopTelemetryClient());
      return prover;
    };
    log = createDebugLogger('aztec:bb-prover-full-rollup');
    context = await TestContext.new(log, 1, buildProver);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it.each([
    [1, 1, 0, 2], // Epoch with a single block, requires one padding block proof
    [2, 2, 0, 2], // Full epoch with two blocks
    // [2, 3, 0, 2], // Epoch with two blocks but the block merge tree was assembled as with 3 leaves, requires one padding block proof; commented out to reduce running time
  ])(
    'proves a private-only epoch with %i/%i blocks with %i/%i non-empty txs each',
    async (blockCount, totalBlocks, nonEmptyTxs, totalTxs) => {
      log.info(`Proving epoch with ${blockCount}/${totalBlocks} blocks with ${nonEmptyTxs}/${totalTxs} non-empty txs`);

      const initialHeader = context.getBlockHeader(0);
      context.orchestrator.startNewEpoch(1, 1, totalBlocks);

      for (let blockNum = 1; blockNum <= blockCount; blockNum++) {
        const globals = makeGlobals(blockNum);
        const l1ToL2Messages = makeTuple(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, Fr.random);
        const txs = await Promise.all(
          times(nonEmptyTxs, async (i: number) => {
            const txOpts = { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0 };
            const tx = await mockTx(blockNum * 100_000 + 1000 * (i + 1), txOpts);
            tx.data.constants.historicalHeader = initialHeader;
            tx.data.constants.vkTreeRoot = await getVKTreeRoot();
            return tx;
          }),
        );

        log.info(`Starting new block #${blockNum}`);
        await context.orchestrator.startNewBlock(totalTxs, globals, l1ToL2Messages);
        log.info(`Processing public functions`);
        const [processed, failed] = await context.processPublicFunctions(txs, nonEmptyTxs, context.epochProver);
        expect(processed.length).toBe(nonEmptyTxs);
        expect(failed.length).toBe(0);

        log.info(`Setting block as completed`);
        await context.orchestrator.setBlockCompleted(blockNum);

        log.info(`Updating world state with new block`);
        const block = await buildBlock(processed, globals, l1ToL2Messages, await context.worldState.fork());
        await context.worldState.handleL2BlockAndMessages(block, l1ToL2Messages);
      }

      log.info(`Awaiting proofs`);
      const epochResult = await context.orchestrator.finaliseEpoch();

      await expect(prover.verifyProof('RootRollupArtifact', epochResult.proof)).resolves.not.toThrow();

      // Generate test data for the 2/2 blocks epoch scenario
      if (blockCount === 2 && totalBlocks === 2 && isGenerateTestDataEnabled()) {
        const epochProof = getTestData('epochProofResult').at(-1);
        writeTestData(
          'yarn-project/end-to-end/src/fixtures/dumps/epoch_proof_result.json',
          JSON.stringify(epochProof!),
        );
      }
    },
  );

  // TODO(@PhilWindle): Remove public functions and re-enable once we can handle empty tx slots
  it.skip('proves all circuits', async () => {
    const numTransactions = 4;
    const txs = await Promise.all(
      times(numTransactions, (i: number) =>
        mockTx(1000 * (i + 1), {
          numberOfNonRevertiblePublicCallRequests: 2,
          numberOfRevertiblePublicCallRequests: 1,
        }),
      ),
    );
    for (const tx of txs) {
      tx.data.constants.historicalHeader = context.getBlockHeader(0);
    }

    const l1ToL2Messages = makeTuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>(
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      Fr.random,
    );

    context.orchestrator.startNewEpoch(1, 1, 1);

    await context.orchestrator.startNewBlock(numTransactions, context.globalVariables, l1ToL2Messages);

    const [processed, failed] = await context.processPublicFunctions(txs, numTransactions, context.epochProver);

    expect(processed.length).toBe(numTransactions);
    expect(failed.length).toBe(0);

    await context.orchestrator.setBlockCompleted(context.blockNumber);

    const result = await context.orchestrator.finaliseEpoch();
    await expect(prover.verifyProof('RootRollupArtifact', result.proof)).resolves.not.toThrow();
  });
});
