import { AztecClientBackend, Barretenberg } from '@aztec/bb.js';
import {
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
  CHONK_PROOF_LENGTH,
  CHONK_VK_LENGTH_IN_FIELDS,
  ULTRA_VK_LENGTH_IN_FIELDS,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { mapAvmCircuitPublicInputsToNoir } from '@aztec/noir-protocol-circuits-types/server';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { PublicTxSimulationTester, bulkTest } from '@aztec/simulator/public/fixtures';
import { AvmCircuitInputs, AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import { RecursiveProof } from '@aztec/stdlib/proofs';
import { VerificationKeyAsFields } from '@aztec/stdlib/vks';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

import MockHidingJson from '../artifacts/mock_hiding.json' with { type: 'json' };
import { getWorkingDirectory } from './bb_working_directory.js';
import { proofBytesToRecursiveProof, proveAvm, proveRollupHonk } from './prove_native.js';
import type { KernelPublicInputs } from './types/index.js';
import {
  MockRollupTxBasePrivateCircuit,
  MockRollupTxBasePublicCircuit,
  MockRollupTxMergeCircuit,
  generateTestingIVCStack,
  mapAvmProofToNoir,
  mapRecursiveProofToNoir,
  mapVerificationKeyToNoir,
  witnessGenMockPublicBaseCircuit,
  witnessGenMockRollupRootCircuit,
  witnessGenMockRollupTxBasePrivateCircuit,
  witnessGenMockRollupTxMergeCircuit,
} from './witgen.js';

/* eslint-disable camelcase */

jest.setTimeout(150_000);

const logger = createLogger('ivc-integration:test:rollup-native');

describe('Rollup IVC Integration', () => {
  let bbBinaryPath: string;

  let chonkProof: RecursiveProof<typeof CHONK_PROOF_LENGTH>;
  let avmVK: VerificationKeyAsFields;
  let avmProof: Fr[];
  let avmPublicInputs: AvmCircuitPublicInputs;

  let clientIVCPublicInputs: KernelPublicInputs;
  let workingDirectory: string;

  beforeAll(async () => {
    const barretenberg = await Barretenberg.initSingleton({
      threads: 16,
      // logger: (m: string) => logger.info(m),
    });

    bbBinaryPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../barretenberg/cpp/build/bin',
      'bb-avm',
    );

    // Create a client IVC proof using the new AztecClientBackend API
    const [bytecodes, witnessStack, tailPublicInputs, vks] = await generateTestingIVCStack(1, 0);
    clientIVCPublicInputs = tailPublicInputs;

    const backend = new AztecClientBackend(bytecodes, barretenberg);
    const [proofAsFields, , vkBytes] = await backend.prove(witnessStack, vks);
    chonkProof = await proofBytesToRecursiveProof(proofAsFields, vkBytes);

    // Create an AVM proof
    const avmWorkingDirectory = await getWorkingDirectory('bb-rollup-ivc-integration-avm-');

    const worldStateService = await NativeWorldStateService.tmp();
    const simTester = await PublicTxSimulationTester.create(worldStateService);
    const avmSimulationResult = await bulkTest(simTester, logger, AvmTestContractArtifact);
    await worldStateService.close();
    expect(avmSimulationResult.revertCode.isOK()).toBe(true);

    const avmCircuitInputs = new AvmCircuitInputs(avmSimulationResult.hints!, avmSimulationResult.publicInputs);
    ({
      vk: avmVK,
      proof: avmProof,
      publicInputs: avmPublicInputs,
    } = await proveAvm(avmCircuitInputs, avmWorkingDirectory, logger));
  });

  beforeEach(async () => {
    workingDirectory = await getWorkingDirectory('bb-rollup-ivc-integration-');
  });

  it('Should be able to generate a proof of a 3 transaction rollup', async () => {
    // Use the pre-generated standalone vk to verify the proof recursively.
    const ivcVk = await VerificationKeyAsFields.fromKey(
      MockHidingJson.verificationKey.fields.map((str: string) => Fr.fromHexString(str)),
    );

    const privateBaseRollupWitnessResult = await witnessGenMockRollupTxBasePrivateCircuit({
      chonk_proof_data: {
        public_inputs: clientIVCPublicInputs,
        proof: mapRecursiveProofToNoir(chonkProof),
        vk_data: mapVerificationKeyToNoir(ivcVk, CHONK_VK_LENGTH_IN_FIELDS),
      },
    });

    const privateBaseProof = await proveRollupHonk(
      'MockRollupTxBasePrivateCircuit',
      bbBinaryPath,
      workingDirectory,
      MockRollupTxBasePrivateCircuit,
      privateBaseRollupWitnessResult.witness,
      logger,
    );

    const privateBaseRollupData = {
      base_or_merge_public_inputs: privateBaseRollupWitnessResult.publicInputs,
      proof: mapRecursiveProofToNoir(privateBaseProof.proof),
      vk: mapVerificationKeyToNoir(privateBaseProof.verificationKey.keyAsFields, ULTRA_VK_LENGTH_IN_FIELDS),
    };

    const publicBaseRollupWitnessResult = await witnessGenMockPublicBaseCircuit({
      chonk_proof_data: {
        public_inputs: clientIVCPublicInputs,
        proof: mapRecursiveProofToNoir(chonkProof),
        vk_data: mapVerificationKeyToNoir(ivcVk, CHONK_VK_LENGTH_IN_FIELDS),
      },
      verification_key: mapVerificationKeyToNoir(avmVK, AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED),
      proof: mapAvmProofToNoir(avmProof),
      public_inputs: mapAvmCircuitPublicInputsToNoir(avmPublicInputs),
    });

    const publicBaseProof = await proveRollupHonk(
      'MockRollupTxBasePublicCircuit',
      bbBinaryPath,
      workingDirectory,
      MockRollupTxBasePublicCircuit,
      publicBaseRollupWitnessResult.witness,
      logger,
    );

    const publicBaseRollupData = {
      base_or_merge_public_inputs: publicBaseRollupWitnessResult.publicInputs,
      proof: mapRecursiveProofToNoir(publicBaseProof.proof),
      vk: mapVerificationKeyToNoir(publicBaseProof.verificationKey.keyAsFields, ULTRA_VK_LENGTH_IN_FIELDS),
    };

    const mergeWitnessResult = await witnessGenMockRollupTxMergeCircuit({
      a: privateBaseRollupData,
      b: publicBaseRollupData,
    });

    const mergeProof = await proveRollupHonk(
      'MockRollupTxMergeCircuit',
      bbBinaryPath,
      workingDirectory,
      MockRollupTxMergeCircuit,
      mergeWitnessResult.witness,
      logger,
    );

    const mergeRollupData = {
      base_or_merge_public_inputs: mergeWitnessResult.publicInputs,
      proof: mapRecursiveProofToNoir(mergeProof.proof),
      vk: mapVerificationKeyToNoir(mergeProof.verificationKey.keyAsFields, ULTRA_VK_LENGTH_IN_FIELDS),
    };

    const rootWitnessResult = await witnessGenMockRollupRootCircuit({ a: privateBaseRollupData, b: mergeRollupData });

    // Three transactions are aggregated
    expect(rootWitnessResult.publicInputs.accumulated).toEqual('0x03');

    // This step takes something like 4 minutes, since it needs to actually prove and remove the IPA claims.
    // Commenting it out for now due to CI speed issues.
    // await proveKeccakHonk(
    //   'MockRollupRootCircuit',
    //   bbBinaryPath,
    //   workingDirectory,
    //   MockRollupRootCircuit,
    //   rootWitnessResult.witness,
    //   logger,
    // );
  }, 300_000);
});
