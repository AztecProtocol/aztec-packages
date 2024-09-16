import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { makePaddingProcessedTxFromTubeProof } from '@aztec/circuit-types';
import {
  NESTED_RECURSIVE_PROOF_LENGTH,
  PrivateKernelEmptyInputData,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { TestContext } from '../mocks/test_context.js';
import { buildBaseRollupInput } from '../orchestrator/block-building-helpers.js';

const logger = createDebugLogger('aztec:bb-prover-base-rollup');

describe('prover/bb_prover/base-rollup', () => {
  let context: TestContext;
  let prover: BBNativeRollupProver;

  beforeAll(async () => {
    const buildProver = async (bbConfig: BBProverConfig) => {
      prover = await BBNativeRollupProver.new(bbConfig, new NoopTelemetryClient());
      return prover;
    };
    context = await TestContext.new(logger, 'legacy', 1, buildProver);
  });

  afterAll(async () => {
    await context.cleanup();
  });

  it('proves the base rollup', async () => {
    const header = context.actualDb.getInitialHeader();
    const chainId = context.globalVariables.chainId;
    const version = context.globalVariables.version;
    const vkTreeRoot = getVKTreeRoot();

    const inputs = new PrivateKernelEmptyInputData(header, chainId, version, vkTreeRoot);
    const paddingTxPublicInputsAndProof = await context.prover.getEmptyTubeProof(inputs);
    const tx = makePaddingProcessedTxFromTubeProof(paddingTxPublicInputsAndProof);

    logger.verbose('Building base rollup inputs');
    const baseRollupInputProof = makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH);
    baseRollupInputProof.proof[0] = paddingTxPublicInputsAndProof.verificationKey.keyAsFields.key[0];
    baseRollupInputProof.proof[1] = paddingTxPublicInputsAndProof.verificationKey.keyAsFields.key[1];
    baseRollupInputProof.proof[2] = paddingTxPublicInputsAndProof.verificationKey.keyAsFields.key[2];
    const baseRollupInputs = await buildBaseRollupInput(
      tx,
      baseRollupInputProof,
      context.globalVariables,
      context.actualDb,
      paddingTxPublicInputsAndProof.verificationKey,
    );
    logger.verbose('Proving base rollups');
    const proofOutputs = await context.prover.getBaseRollupProof(baseRollupInputs);
    logger.verbose('Verifying base rollups');
    await expect(prover.verifyProof('BaseRollupArtifact', proofOutputs.proof.binaryProof)).resolves.not.toThrow();
  });
});
