import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { makeEmptyProcessedTx } from '@aztec/circuit-types';
import {
  PRIVATE_KERNEL_EMPTY_INDEX,
  type PrivateBaseRollupHints,
  PrivateBaseRollupInputs,
  PrivateKernelEmptyInputData,
  PrivateTubeData,
  SpongeBlob,
  VkWitnessData,
} from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { getVKSiblingPath, getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { TestContext } from '../mocks/test_context.js';
import { buildBaseRollupHints } from '../orchestrator/block-building-helpers.js';

const logger = createLogger('prover-client:test:bb-prover-base-rollup');

describe('prover/bb_prover/base-rollup', () => {
  let context: TestContext;
  let prover: BBNativeRollupProver;

  beforeAll(async () => {
    const buildProver = async (bbConfig: BBProverConfig) => {
      prover = await BBNativeRollupProver.new(bbConfig, new NoopTelemetryClient());
      return prover;
    };
    context = await TestContext.new(logger, 1, buildProver);
  });

  afterAll(async () => {
    await context.cleanup();
  });

  it('proves the base rollup', async () => {
    const header = context.getBlockHeader(0);
    const chainId = context.globalVariables.chainId;
    const version = context.globalVariables.version;
    const vkTreeRoot = getVKTreeRoot();

    const tx = makeEmptyProcessedTx(header, chainId, version, vkTreeRoot, protocolContractTreeRoot);
    const startSpongeBlob = SpongeBlob.init(tx.txEffect.toBlobFields().length);

    logger.verbose('Building empty private proof');
    const privateInputs = new PrivateKernelEmptyInputData(
      header,
      chainId,
      version,
      vkTreeRoot,
      protocolContractTreeRoot,
    );
    const tubeProof = await context.prover.getEmptyPrivateKernelProof(privateInputs);
    expect(tubeProof.inputs).toEqual(tx.data.toKernelCircuitPublicInputs());

    const vkIndex = PRIVATE_KERNEL_EMPTY_INDEX;
    const vkPath = getVKSiblingPath(vkIndex);
    const vkData = new VkWitnessData(tubeProof.verificationKey, vkIndex, vkPath);

    const tubeData = new PrivateTubeData(tubeProof.inputs, tubeProof.proof, vkData);

    const baseRollupHints = await buildBaseRollupHints(
      tx,
      context.globalVariables,
      await context.getFork(),
      startSpongeBlob,
    );
    const baseRollupInputs = new PrivateBaseRollupInputs(tubeData, baseRollupHints as PrivateBaseRollupHints);

    logger.verbose('Proving base rollups');
    const proofOutputs = await context.prover.getPrivateBaseRollupProof(baseRollupInputs);
    logger.verbose('Verifying base rollups');
    await expect(
      prover.verifyProof('PrivateBaseRollupArtifact', proofOutputs.proof.binaryProof),
    ).resolves.not.toThrow();
  });
});
