import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { makePaddingProcessedTxFromTubeProof } from '@aztec/circuit-types';
import {
  NESTED_RECURSIVE_PROOF_LENGTH,
  PRIVATE_KERNEL_EMPTY_INDEX,
  PrivateBaseRollupInputs,
  PrivateKernelEmptyInputData,
  PrivateTubeData,
  VkWitnessData,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { getVKSiblingPath, getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { TestContext } from '../mocks/test_context.js';
import { buildBaseRollupHints } from '../orchestrator/block-building-helpers.js';

const logger = createDebugLogger('aztec:bb-prover-base-rollup');

describe('prover/bb_prover/base-rollup', () => {
  let context: TestContext;
  let prover: BBNativeRollupProver;

  beforeAll(async () => {
    const buildProver = async (bbConfig: BBProverConfig) => {
      prover = await BBNativeRollupProver.new(bbConfig, new NoopTelemetryClient());
      return prover;
    };
    context = await TestContext.new(logger, 'native', 1, buildProver);
  });

  afterAll(async () => {
    await context.cleanup();
  });

  it('proves the base rollup', async () => {
    const header = context.actualDb.getInitialHeader();
    const chainId = context.globalVariables.chainId;
    const version = context.globalVariables.version;
    const vkTreeRoot = getVKTreeRoot();

    const inputs = new PrivateKernelEmptyInputData(header, chainId, version, vkTreeRoot, protocolContractTreeRoot);
    const paddingTxPublicInputsAndProof = await context.prover.getEmptyTubeProof(inputs);
    const tx = makePaddingProcessedTxFromTubeProof(paddingTxPublicInputsAndProof);

    logger.verbose('Building base rollup inputs');
    const baseRollupInputProof = makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH);
    const verificationKey = paddingTxPublicInputsAndProof.verificationKey;
    baseRollupInputProof.proof[0] = verificationKey.keyAsFields.key[0];
    baseRollupInputProof.proof[1] = verificationKey.keyAsFields.key[1];
    baseRollupInputProof.proof[2] = verificationKey.keyAsFields.key[2];

    const vkIndex = PRIVATE_KERNEL_EMPTY_INDEX;
    const vkPath = getVKSiblingPath(vkIndex);
    const vkData = new VkWitnessData(verificationKey, vkIndex, vkPath);

    const tubeData = new PrivateTubeData(tx.data, baseRollupInputProof, vkData);

    const baseRollupHints = await buildBaseRollupHints(tx, context.globalVariables, context.actualDb);
    const baseRollupInputs = new PrivateBaseRollupInputs(tubeData, baseRollupHints);

    logger.verbose('Proving base rollups');
    const proofOutputs = await context.prover.getPrivateBaseRollupProof(baseRollupInputs);
    logger.verbose('Verifying base rollups');
    await expect(
      prover.verifyProof('PrivateBaseRollupArtifact', proofOutputs.proof.binaryProof),
    ).resolves.not.toThrow();
  });
});
