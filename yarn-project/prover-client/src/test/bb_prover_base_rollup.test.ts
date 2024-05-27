import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { VerificationKeyData } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { makeBloatedProcessedTx } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';
import { buildBaseRollupInput } from '../orchestrator/block-building-helpers.js';

const logger = createDebugLogger('aztec:bb-prover-base-rollup');

describe('prover/bb_prover/base-rollup', () => {
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

  // TODO(@PhilWindle): Re-enable once we can handle empty tx slots
  it.skip('proves the base rollup', async () => {
    const tx = await makeBloatedProcessedTx(context.actualDb, 1);

    logger.verbose('Building base rollup inputs');
    const baseRollupInputs = await buildBaseRollupInput(
      tx,
      context.globalVariables,
      context.actualDb,
      VerificationKeyData.makeFake(),
    );
    logger.verbose('Proving base rollups');
    const proofOutputs = await context.prover.getBaseRollupProof(baseRollupInputs);
    logger.verbose('Verifying base rollups');
    await expect(prover.verifyProof('BaseRollupArtifact', proofOutputs.proof.binaryProof)).resolves.not.toThrow();
  });
});
