import { BB_RESULT, verifyClientIvcProof, writeClientIVCProofToOutputDirectory } from '@aztec/bb-prover';
import {
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
  TUBE_PROOF_LENGTH,
  ULTRA_VK_LENGTH_IN_FIELDS,
} from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';
import { mapAvmCircuitPublicInputsToNoir } from '@aztec/noir-protocol-circuits-types/server';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { PublicTxSimulationTester, bulkTest, createAvmMinimalPublicTx } from '@aztec/simulator/public/fixtures';
import type { AvmCircuitInputs } from '@aztec/stdlib/avm';
import type { ProofAndVerificationKey } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

import { getWorkingDirectory } from './bb_working_directory.js';
import { proveAvm, proveClientIVC, proveRollupHonk, proveTube } from './prove_native.js';
import type { KernelPublicInputs } from './types/index.js';
import {
  MockRollupBasePublicCircuit,
  generateTestingIVCStack,
  mapAvmProofToNoir,
  mapRecursiveProofToNoir,
  mapVerificationKeyToNoir,
  witnessGenMockPublicBaseCircuit,
} from './witgen.js';

// Auto-generated types from noir are not in camel case.
/* eslint-disable camelcase */

jest.setTimeout(120_000);

const logger = createLogger('ivc-integration:test:avm-integration');

async function proveMockPublicBaseRollup(
  avmCircuitInputs: AvmCircuitInputs,
  bbWorkingDirectory: string,
  bbBinaryPath: string,
  clientIVCPublicInputs: KernelPublicInputs,
  tubeProof: ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>,
  skipPublicInputsValidation: boolean = false,
) {
  const { vk, proof, publicInputs } = await proveAvm(
    avmCircuitInputs,
    bbWorkingDirectory,
    logger,
    skipPublicInputsValidation,
  );

  const baseWitnessResult = await witnessGenMockPublicBaseCircuit({
    tube_data: {
      public_inputs: clientIVCPublicInputs,
      proof: mapRecursiveProofToNoir(tubeProof.proof),
      vk_data: mapVerificationKeyToNoir(tubeProof.verificationKey.keyAsFields, ULTRA_VK_LENGTH_IN_FIELDS),
    },
    verification_key: mapVerificationKeyToNoir(vk, AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED),
    proof: mapAvmProofToNoir(proof),
    public_inputs: mapAvmCircuitPublicInputsToNoir(publicInputs),
  });

  await proveRollupHonk(
    'MockRollupBasePublicCircuit',
    bbBinaryPath,
    bbWorkingDirectory,
    MockRollupBasePublicCircuit,
    baseWitnessResult.witness,
    logger,
  );
}

describe('AVM Integration', () => {
  let bbWorkingDirectory: string;
  let bbBinaryPath: string;
  let tubeProof: ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>;
  let clientIVCPublicInputs: KernelPublicInputs;

  let simTester: PublicTxSimulationTester;

  beforeAll(async () => {
    const clientIVCProofPath = await getWorkingDirectory('bb-avm-integration-client-ivc-');
    bbBinaryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../barretenberg/cpp/build/bin', 'bb');
    const [bytecodes, witnessStack, tailPublicInputs, vks] = await generateTestingIVCStack(1, 0);
    clientIVCPublicInputs = tailPublicInputs;
    const proof = await proveClientIVC(bbBinaryPath, clientIVCProofPath, witnessStack, bytecodes, vks, logger);
    await writeClientIVCProofToOutputDirectory(proof, clientIVCProofPath);
    const verifyResult = await verifyClientIvcProof(
      bbBinaryPath,
      clientIVCProofPath.concat('/proof'),
      clientIVCProofPath.concat('/vk'),
      logger.info,
    );
    expect(verifyResult.status).toEqual(BB_RESULT.SUCCESS);
    tubeProof = await proveTube(bbBinaryPath, clientIVCProofPath, logger);
  });

  beforeEach(async () => {
    //Create a temp working dir
    bbWorkingDirectory = await getWorkingDirectory('bb-avm-integration-');

    simTester = await PublicTxSimulationTester.create();
  });

  it('Should generate and verify an ultra honk proof from an AVM verification of the bulk test', async () => {
    const avmSimulationResult = await bulkTest(simTester, logger, AvmTestContractArtifact);
    expect(avmSimulationResult.revertCode.isOK()).toBe(true);
    const avmCircuitInputs = avmSimulationResult.avmProvingRequest.inputs;

    await proveMockPublicBaseRollup(
      avmCircuitInputs,
      bbWorkingDirectory,
      bbBinaryPath,
      clientIVCPublicInputs,
      tubeProof,
    );
  }, 240_000);

  it('Should generate and verify an ultra honk proof from an AVM verification for the minimal TX with skipping public inputs validation', async () => {
    const result = await createAvmMinimalPublicTx();
    expect(result.revertCode.isOK()).toBe(true);

    await proveMockPublicBaseRollup(
      result.avmProvingRequest.inputs,
      bbWorkingDirectory,
      bbBinaryPath,
      clientIVCPublicInputs,
      tubeProof,
      true,
    );
  }, 240_000);
});
