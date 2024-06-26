import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { makePaddingProcessedTx } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';
import { buildBaseRollupInput } from '../orchestrator/block-building-helpers.js';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

const logger = createDebugLogger('aztec:bb-prover-base-rollup');

describe('prover/bb_prover/tube-rollup', () => {
  let context: TestContext;
  let prover: BBNativeRollupProver;

  beforeAll(async () => {
    const buildProver = async (bbConfig: BBProverConfig) => {
      // TODO: put proper path heree
      bbConfig.bbWorkingDirectory = '/mnt/user-data/mara/aztec-packages/barretenberg/cpp/build/bin/proofs';
      prover = await BBNativeRollupProver.new(bbConfig, new NoopTelemetryClient);
      return prover;
    };
    context = await TestContext.new(logger, 1, buildProver);
  });

  afterAll(async () => {
    await context.cleanup();
  });

  // LONDONTODO(BaseRollup): Good starting point.
  // LONDONTODO(Rollup):     Also Good starting point.
  // LONDONTODO(Rollup):     Duplicate and make a test of just merge cicuit. Another file?
  // it('proves the base rollup', async () => {
  //   const header = await context.actualDb.buildInitialHeader();
  //   const chainId = context.globalVariables.chainId;
  //   const version = context.globalVariables.version;

  //   const inputs = {
  //     header,
  //     chainId,
  //     version,
  //   };

  //   const paddingTxPublicInputsAndProof = await context.prover.getEmptyPrivateKernelProof(inputs);

  //   const tx = makePaddingProcessedTx(paddingTxPublicInputsAndProof);

  //   logger.verbose('Building base rollup inputs');
  //   const baseRollupInputs = await buildBaseRollupInput(
  //     tx,
  //     context.globalVariables,
  //     context.actualDb,
  //     paddingTxPublicInputsAndProof.verificationKey,
  //   );
  //   logger.verbose('Proving base rollups');
  //   const proofOutputs = await context.prover.getBaseRollupProof(baseRollupInputs);
  //   logger.verbose('Verifying base rollups');
  //   await expect(prover.verifyProof('BaseRollupArtifact', proofOutputs.proof.binaryProof)).resolves.not.toThrow();
  // });

  it('proves the tube rollup', async () => {
    // const header = await context.actualDb.buildInitialHeader();
    // const chainId = context.globalVariables.chainId;
    // const version = context.globalVariables.version;

    // const inputs = {
    //   header,
    //   chainId,
    //   version,
    // };

    // const paddingTxPublicInputsAndProof = await context.prover.getEmptyPrivateKernelProof(inputs);

    // const tx = makePaddingProcessedTx(paddingTxPublicInputsAndProof);

    // logger.verbose('Building base rollup inputs');
    // const baseRollupInputs = await buildBaseRollupInput(
    //   tx,
    //   context.globalVariables,
    //   context.actualDb,
    //   paddingTxPublicInputsAndProof.verificationKey,
    // );
    logger.verbose('Proving tube rollups');
    await context.prover.getTubeRollupProofFromArtifact!();
    logger.verbose('boom');
  });
});
