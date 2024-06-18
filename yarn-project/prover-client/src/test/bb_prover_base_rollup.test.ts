import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { makePaddingProcessedTxFromTubeProof } from '@aztec/circuit-types';
import { TubeInputs } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

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

  it('proves the base rollup', async () => {
    const header = await context.actualDb.buildInitialHeader();
    const chainId = context.globalVariables.chainId;
    const version = context.globalVariables.version;

    const inputs = {
      header,
      chainId,
      version,
    };

    const paddingTxPublicInputsAndProof = await context.prover.getEmptyTubeProof(inputs);
    const tx = makePaddingProcessedTxFromTubeProof(paddingTxPublicInputsAndProof);

    logger.verbose('Building base rollup inputs');
    const baseRollupInputs = await buildBaseRollupInput(
      tx,
      context.globalVariables,
      context.actualDb,
      paddingTxPublicInputsAndProof.verificationKey,
    );
    // const tubeRollupInputs =
    logger.verbose('Proving base rollups');
    // logger.debug(`proof: ${baseRollupInputs.kernelData.proof}`);
    // TODO(TubeInputs): make actual TubeInputs;
    const proofOutputs = await context.prover.getBaseRollupProof(baseRollupInputs, TubeInputs.empty());
    logger.verbose('Verifying base rollups');
    await expect(prover.verifyProof('BaseRollupArtifact', proofOutputs.proof.binaryProof)).resolves.not.toThrow();
  });
});
