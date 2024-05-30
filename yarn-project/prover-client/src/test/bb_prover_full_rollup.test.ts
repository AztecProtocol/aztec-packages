import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { PROVING_STATUS, mockTx } from '@aztec/circuit-types';
import { Fr, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, getMockVerificationKeys } from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';

const logger = createDebugLogger('aztec:bb-prover-full-rollup');

describe('prover/bb_prover/full-rollup', () => {
  let context: TestContext;
  let prover: BBNativeRollupProver;

  beforeAll(async () => {
    const buildProver = async (bbConfig: BBProverConfig) => {
      prover = await BBNativeRollupProver.new(bbConfig);
      return prover;
    };
    context = await TestContext.new(logger, 1, buildProver);
  });

  afterAll(async () => {
    await context.cleanup();
  });

  it('proves a private-only full rollup', async () => {
    const numTransactions = 3;
    const txs = times(numTransactions, (i: number) =>
      mockTx(1000 * (i + 1), {
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertiblePublicCallRequests: 0,
      }),
    );
    for (const tx of txs) {
      tx.data.constants.historicalHeader = await context.actualDb.buildInitialHeader();
    }

    const l1ToL2Messages = makeTuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>(
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      Fr.random,
    );

    const provingTicket = await context.orchestrator.startNewBlock(
      numTransactions,
      context.globalVariables,
      l1ToL2Messages,
      getMockVerificationKeys(),
    );

    await context.orchestrator.setBlockCompleted();

    const provingResult = await provingTicket.provingPromise;

    expect(provingResult.status).toBe(PROVING_STATUS.SUCCESS);

    const blockResult = await context.orchestrator.finaliseBlock();

    await expect(prover.verifyProof('RootRollupArtifact', blockResult.proof)).resolves.not.toThrow();
  });

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
      tx.data.constants.historicalHeader = await context.actualDb.buildInitialHeader();
    }

    const l1ToL2Messages = makeTuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>(
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      Fr.random,
    );

    const provingTicket = await context.orchestrator.startNewBlock(
      numTransactions,
      context.globalVariables,
      l1ToL2Messages,
      getMockVerificationKeys(),
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
