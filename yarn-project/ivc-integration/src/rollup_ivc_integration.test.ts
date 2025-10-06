import { BB_RESULT, verifyClientIvcProof } from '@aztec/bb-prover';
import {
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
  CIVC_PROOF_LENGTH,
  CIVC_VK_LENGTH_IN_FIELDS,
  ULTRA_VK_LENGTH_IN_FIELDS,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { mapAvmCircuitPublicInputsToNoir } from '@aztec/noir-protocol-circuits-types/server';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { PublicTxSimulationTester, bulkTest } from '@aztec/simulator/public/fixtures';
import { AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
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

  let ivcProof: ProofAndVerificationKey<typeof CIVC_PROOF_LENGTH>;
  let avmVK: VerificationKeyAsFields;
  let avmProof: Fr[];
  let avmPublicInputs: AvmCircuitPublicInputs;

  let clientIVCPublicInputs: KernelPublicInputs;
  let workingDirectory: string;

  beforeAll(async () => {
    bbBinaryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../barretenberg/cpp/build/bin', 'bb');

    // Create a client IVC proof
    const clientIVCWorkingDirectory = await getWorkingDirectory('bb-rollup-ivc-integration-client-ivc-');
    const [bytecodes, witnessStack, tailPublicInputs, vks] = await generateTestingIVCStack(1, 0);
    clientIVCPublicInputs = tailPublicInputs;

    ivcProof = await proveClientIVC(bbBinaryPath, clientIVCWorkingDirectory, witnessStack, bytecodes, vks, logger);
    const ivcVerifyResult = await verifyClientIvcProof(
      bbBinaryPath,
      clientIVCWorkingDirectory.concat('/proof'),
      clientIVCWorkingDirectory.concat('/vk'),
      logger.info,
    );
    expect(ivcVerifyResult.status).toEqual(BB_RESULT.SUCCESS);

    // Create an AVM proof
    const avmWorkingDirectory = await getWorkingDirectory('bb-rollup-ivc-integration-avm-');

    const simTester = await PublicTxSimulationTester.create();
    const avmSimulationResult = await bulkTest(simTester, logger, AvmTestContractArtifact);
    expect(avmSimulationResult.revertCode.isOK()).toBe(true);

    const avmCircuitInputs = avmSimulationResult.avmProvingRequest.inputs;
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
      civc_proof_data: {
        public_inputs: clientIVCPublicInputs,
        proof: mapRecursiveProofToNoir(ivcProof.proof),
        vk_data: mapVerificationKeyToNoir(ivcVk, CIVC_VK_LENGTH_IN_FIELDS),
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
      civc_proof_data: {
        public_inputs: clientIVCPublicInputs,
        proof: mapRecursiveProofToNoir(ivcProof.proof),
        vk_data: mapVerificationKeyToNoir(ivcVk, CIVC_VK_LENGTH_IN_FIELDS),
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
