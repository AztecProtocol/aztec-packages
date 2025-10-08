import {
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
  CIVC_PROOF_LENGTH,
  CIVC_VK_LENGTH_IN_FIELDS,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { mapAvmCircuitPublicInputsToNoir } from '@aztec/noir-protocol-circuits-types/server';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { PublicTxSimulationTester, bulkTest, simAvmMinimalPublicTx } from '@aztec/simulator/public/fixtures';
import type { AvmCircuitInputs } from '@aztec/stdlib/avm';
import type { ProofAndVerificationKey } from '@aztec/stdlib/interfaces/server';
import { VerificationKeyAsFields } from '@aztec/stdlib/vks';

import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

import MockHidingJson from '../artifacts/mock_hiding.json' with { type: 'json' };
import { getWorkingDirectory } from './bb_working_directory.js';
import { proveAvm, proveClientIVC, proveRollupHonk } from './prove_native.js';
import type { KernelPublicInputs } from './types/index.js';
import {
  MockRollupTxBasePublicCircuit,
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
  civcProof: ProofAndVerificationKey<typeof CIVC_PROOF_LENGTH>,
  skipPublicInputsValidation: boolean = false,
) {
  const { vk, proof, publicInputs } = await proveAvm(
    avmCircuitInputs,
    bbWorkingDirectory,
    logger,
    skipPublicInputsValidation,
  );

  // Use the pre-generated standalone vk to verify the proof recursively.
  const ivcVk = await VerificationKeyAsFields.fromKey(
    MockHidingJson.verificationKey.fields.map((str: string) => Fr.fromHexString(str)),
  );
  const baseWitnessResult = await witnessGenMockPublicBaseCircuit({
    civc_proof_data: {
      public_inputs: clientIVCPublicInputs,
      proof: mapRecursiveProofToNoir(civcProof.proof),
      vk_data: mapVerificationKeyToNoir(ivcVk, CIVC_VK_LENGTH_IN_FIELDS),
    },
    verification_key: mapVerificationKeyToNoir(vk, AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED),
    proof: mapAvmProofToNoir(proof),
    public_inputs: mapAvmCircuitPublicInputsToNoir(publicInputs),
  });

  await proveRollupHonk(
    'MockRollupTxBasePublicCircuit',
    bbBinaryPath,
    bbWorkingDirectory,
    MockRollupTxBasePublicCircuit,
    baseWitnessResult.witness,
    logger,
  );
}

describe('AVM Integration', () => {
  let bbWorkingDirectory: string;
  let bbBinaryPath: string;
  let civcProof: ProofAndVerificationKey<typeof CIVC_PROOF_LENGTH>;
  let clientIVCPublicInputs: KernelPublicInputs;

  let simTester: PublicTxSimulationTester;

  beforeAll(async () => {
    const clientIVCProofPath = await getWorkingDirectory('bb-avm-integration-client-ivc-');
    bbBinaryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../barretenberg/cpp/build/bin', 'bb');
    const [bytecodes, witnessStack, tailPublicInputs, vks] = await generateTestingIVCStack(1, 0);
    clientIVCPublicInputs = tailPublicInputs;
    civcProof = await proveClientIVC(bbBinaryPath, clientIVCProofPath, witnessStack, bytecodes, vks, logger);
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
      civcProof,
    );
  }, 240_000);

  it('Should generate and verify an ultra honk proof from an AVM verification for the minimal TX with skipping public inputs validation', async () => {
    const result = await simAvmMinimalPublicTx();
    expect(result.revertCode.isOK()).toBe(true);

    await proveMockPublicBaseRollup(
      result.avmProvingRequest.inputs,
      bbWorkingDirectory,
      bbBinaryPath,
      clientIVCPublicInputs,
      civcProof,
      true,
    );
  }, 240_000);
});
