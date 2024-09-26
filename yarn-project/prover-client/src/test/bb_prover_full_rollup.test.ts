import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { PROVING_STATUS, mockTx } from '@aztec/circuit-types';
import { Fr, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { makeGlobals } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';

describe('prover/bb_prover/full-rollup', () => {
  let context: TestContext;
  let prover: BBNativeRollupProver;
  let log: DebugLogger;

  beforeAll(async () => {
    const buildProver = async (bbConfig: BBProverConfig) => {
      prover = await BBNativeRollupProver.new(bbConfig, new NoopTelemetryClient());
      return prover;
    };
    log = createDebugLogger('aztec:bb-prover-full-rollup');
    context = await TestContext.new(log, 'legacy', 1, buildProver);
  });

  afterAll(async () => {
    await context.cleanup();
  });

  it.each([
    [1, 1, 0, 2], // Epoch with a single block, requires one padding block proof
    [2, 2, 0, 2], // Full epoch with two blocks
    [2, 3, 0, 2], // Epoch with two blocks but the block merge tree was assembled as with 3 leaves, requires one padding block proof
  ])(
    'proves a private-only epoch with %i/%i blocks with %i/%i non-empty txs each',
    async (blockCount, totalBlocks, nonEmptyTxs, totalTxs) => {
      log.info(`Proving epoch with ${blockCount}/${totalBlocks} blocks with ${nonEmptyTxs}/${totalTxs} non-empty txs`);

      const initialHeader = context.actualDb.getInitialHeader();
      const provingTicket = context.orchestrator.startNewEpoch(1, totalBlocks);

      for (let blockNum = 1; blockNum <= blockCount; blockNum++) {
        const globals = makeGlobals(blockNum);
        const l1ToL2Messages = makeTuple(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, Fr.random);
        const txs = times(nonEmptyTxs, (i: number) => {
          const txOpts = { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0 };
          const tx = mockTx(blockNum * 100_000 + 1000 * (i + 1), txOpts);
          tx.data.constants.historicalHeader = initialHeader;
          tx.data.constants.vkTreeRoot = getVKTreeRoot();
          return tx;
        });

        log.info(`Starting new block #${blockNum}`);
        await context.orchestrator.startNewBlock(totalTxs, globals, l1ToL2Messages);
        log.info(`Processing public functions`);
        const [processed, failed] = await context.processPublicFunctions(txs, nonEmptyTxs, context.blockProver);
        expect(processed.length).toBe(nonEmptyTxs);
        expect(failed.length).toBe(0);

        log.info(`Setting block as completed`);
        await context.orchestrator.setBlockCompleted();
      }

      log.info(`Setting epoch as completed`);
      context.orchestrator.setEpochCompleted();

      log.info(`Awaiting proofs`);
      const provingResult = await provingTicket.provingPromise;
      expect(provingResult.status).toBe(PROVING_STATUS.SUCCESS);
      const epochResult = context.orchestrator.finaliseEpoch();

      await expect(prover.verifyProof('RootRollupArtifact', epochResult.proof)).resolves.not.toThrow();
    },
  );

  // TODO(@PhilWindle): Remove public functions and re-enable once we can handle empty tx slots
  it.skip('proves all circuits', async () => {
    const numTransactions = 4;
    const txs = times(numTransactions, (i: number) =>
      mockTx(1000 * (i + 1), {
        numberOfNonRevertiblePublicCallRequests: 2,
        numberOfRevertiblePublicCallRequests: 1,
      }),
    );
    for (const tx of txs) {
      tx.data.constants.historicalHeader = context.actualDb.getInitialHeader();
    }

    const l1ToL2Messages = makeTuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>(
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      Fr.random,
    );

    const provingTicket = await context.orchestrator.startNewBlock(
      numTransactions,
      context.globalVariables,
      l1ToL2Messages,
    );

    const [processed, failed] = await context.processPublicFunctions(txs, numTransactions, context.blockProver);

    expect(processed.length).toBe(numTransactions);
    expect(failed.length).toBe(0);

    await context.orchestrator.setBlockCompleted();

    const provingResult = await provingTicket.provingPromise;

    expect(provingResult.status).toBe(PROVING_STATUS.SUCCESS);

    const blockResult = await context.orchestrator.finaliseBlock();

    await expect(prover.verifyProof('RootRollupArtifact', blockResult.proof)).resolves.not.toThrow();
  });
});
