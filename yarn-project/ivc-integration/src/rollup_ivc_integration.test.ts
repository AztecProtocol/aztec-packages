import { BB_RESULT, verifyClientIvcProof, writeClientIVCProofToOutputDirectory } from '@aztec/bb-prover';
import { ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS, TUBE_PROOF_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { mapAvmCircuitPublicInputsToNoir } from '@aztec/noir-protocol-circuits-types/server';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { PublicTxSimulationTester } from '@aztec/simulator/public/fixtures';
import { AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ProofAndVerificationKey } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

import { getWorkingDirectory } from './bb_working_directory.js';
import {
  MockRollupBasePrivateCircuit,
  MockRollupBasePublicCircuit,
  MockRollupMergeCircuit,
  generate3FunctionTestingIVCStack,
  mapAvmProofToNoir,
  mapAvmVerificationKeyToNoir,
  mapRecursiveProofToNoir,
  mapVerificationKeyToNoir,
  witnessGenMockPublicBaseCircuit,
  witnessGenMockRollupBasePrivateCircuit,
  witnessGenMockRollupMergeCircuit,
  witnessGenMockRollupRootCircuit,
} from './index.js';
import { proveAvm, proveClientIVC, proveRollupHonk, proveTube } from './prove_native.js';
import type { KernelPublicInputs } from './types/index.js';

/* eslint-disable camelcase */

jest.setTimeout(240_000);

const logger = createLogger('ivc-integration:test:rollup-native');

describe('Rollup IVC Integration', () => {
  let bbBinaryPath: string;

  let tubeProof: ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>;
  let avmVK: Fr[];
  let avmProof: Fr[];
  let avmPublicInputs: AvmCircuitPublicInputs;

  let clientIVCPublicInputs: KernelPublicInputs;
  let workingDirectory: string;

  beforeAll(async () => {
    bbBinaryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../barretenberg/cpp/build/bin', 'bb');

    // Create a client IVC proof
    const clientIVCWorkingDirectory = await getWorkingDirectory('bb-rollup-ivc-integration-client-ivc-');
    const [bytecodes, witnessStack, tailPublicInputs, vks] = await generate3FunctionTestingIVCStack();
    clientIVCPublicInputs = tailPublicInputs;
    const proof = await proveClientIVC(bbBinaryPath, clientIVCWorkingDirectory, witnessStack, bytecodes, vks, logger);
    await writeClientIVCProofToOutputDirectory(proof, clientIVCWorkingDirectory);
    const verifyResult = await verifyClientIvcProof(
      bbBinaryPath,
      clientIVCWorkingDirectory.concat('/proof'),
      clientIVCWorkingDirectory.concat('/vk'),
      logger.info,
    );
    expect(verifyResult.status).toEqual(BB_RESULT.SUCCESS);

    tubeProof = await proveTube(bbBinaryPath, clientIVCWorkingDirectory, logger);

    // Create an AVM proof
    const avmWorkingDirectory = await getWorkingDirectory('bb-rollup-ivc-integration-avm-');

    const simTester = await PublicTxSimulationTester.create();
    const avmTestContractInstance = await simTester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
    const argsField = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const argsU8 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const args = [
      argsField,
      argsU8,
      /*getInstanceForAddress=*/ avmTestContractInstance.address.toField(),
      /*expectedDeployer=*/ avmTestContractInstance.deployer.toField(),
      /*expectedClassId=*/ avmTestContractInstance.currentContractClassId.toField(),
      /*expectedInitializationHash=*/ avmTestContractInstance.initializationHash.toField(),
    ];

    const avmSimulationResult = await simTester.simulateTx(
      /*sender=*/ AztecAddress.fromNumber(42),
      /*setupCalls=*/ [],
      /*appCalls=*/ [{ address: avmTestContractInstance.address, fnName: 'bulk_testing', args }],
      /*teardownCall=*/ undefined,
    );

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
    const privateBaseRollupWitnessResult = await witnessGenMockRollupBasePrivateCircuit({
      tube_data: {
        public_inputs: clientIVCPublicInputs,
        proof: mapRecursiveProofToNoir(tubeProof.proof),
        vk_data: mapVerificationKeyToNoir(
          tubeProof.verificationKey.keyAsFields,
          ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
        ),
      },
    });

    const privateBaseProof = await proveRollupHonk(
      'MockRollupBasePrivateCircuit',
      bbBinaryPath,
      workingDirectory,
      MockRollupBasePrivateCircuit,
      privateBaseRollupWitnessResult.witness,
      logger,
    );

    const privateBaseRollupData = {
      base_or_merge_public_inputs: privateBaseRollupWitnessResult.publicInputs,
      proof: mapRecursiveProofToNoir(privateBaseProof.proof),
      vk: mapVerificationKeyToNoir(
        privateBaseProof.verificationKey.keyAsFields,
        ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
      ),
    };

    const publicBaseRollupWitnessResult = await witnessGenMockPublicBaseCircuit({
      tube_data: {
        public_inputs: clientIVCPublicInputs,
        proof: mapRecursiveProofToNoir(tubeProof.proof),
        vk_data: mapVerificationKeyToNoir(
          tubeProof.verificationKey.keyAsFields,
          ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
        ),
      },
      verification_key: mapAvmVerificationKeyToNoir(avmVK),
      proof: mapAvmProofToNoir(avmProof),
      public_inputs: mapAvmCircuitPublicInputsToNoir(avmPublicInputs),
    });

    const publicBaseProof = await proveRollupHonk(
      'MockRollupBasePublicCircuit',
      bbBinaryPath,
      workingDirectory,
      MockRollupBasePublicCircuit,
      publicBaseRollupWitnessResult.witness,
      logger,
    );

    const publicBaseRollupData = {
      base_or_merge_public_inputs: publicBaseRollupWitnessResult.publicInputs,
      proof: mapRecursiveProofToNoir(publicBaseProof.proof),
      vk: mapVerificationKeyToNoir(
        publicBaseProof.verificationKey.keyAsFields,
        ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
      ),
    };

    const mergeWitnessResult = await witnessGenMockRollupMergeCircuit({
      a: privateBaseRollupData,
      b: publicBaseRollupData,
    });

    const mergeProof = await proveRollupHonk(
      'MockRollupMergeCircuit',
      bbBinaryPath,
      workingDirectory,
      MockRollupMergeCircuit,
      mergeWitnessResult.witness,
      logger,
    );

    const mergeRollupData = {
      base_or_merge_public_inputs: mergeWitnessResult.publicInputs,
      proof: mapRecursiveProofToNoir(mergeProof.proof),
      vk: mapVerificationKeyToNoir(
        mergeProof.verificationKey.keyAsFields,
        ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
      ),
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
