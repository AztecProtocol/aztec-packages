import { BB_RESULT, verifyClientIvcProof, writeClientIVCProofToOutputDirectory } from '@aztec/bb-prover';
import { ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS, TUBE_PROOF_LENGTH } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { PublicTxSimulationTester } from '@aztec/simulator/server';
import type { AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ProofAndVerificationKey } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  MockRollupBasePrivateCircuit,
  MockRollupBasePublicCircuit,
  MockRollupMergeCircuit,
  generate3FunctionTestingIVCStack,
  mapAvmProofToNoir,
  mapAvmPublicInputsToNoir,
  mapAvmVerificationKeyToNoir,
  mapRecursiveProofToNoir,
  mapVerificationKeyToNoir,
  simulateAvmBulkTesting,
  witnessGenMockPublicBaseCircuit,
  witnessGenMockRollupBasePrivateCircuit,
  witnessGenMockRollupMergeCircuit,
  witnessGenMockRollupRootCircuit,
} from './index.js';
import { proveAvm, proveClientIVC, proveRollupHonk, proveTube } from './prove_native.js';
import type { KernelPublicInputs } from './types/index.js';

/* eslint-disable camelcase */

jest.setTimeout(120_000);

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
    const clientIVCWorkingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-rollup-ivc-integration-client-ivc-'));
    const [bytecodes, witnessStack, tailPublicInputs] = await generate3FunctionTestingIVCStack();
    clientIVCPublicInputs = tailPublicInputs;
    const proof = await proveClientIVC(bbBinaryPath, clientIVCWorkingDirectory, witnessStack, bytecodes, logger);
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
    const avmWorkingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-rollup-ivc-integration-avm-'));

    const simTester = await PublicTxSimulationTester.create();
    const avmTestContractInstance = await simTester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
    const avmSimulationResult = await simulateAvmBulkTesting(simTester, avmTestContractInstance);
    const avmCircuitInputs = avmSimulationResult.avmProvingRequest.inputs;

    ({
      vk: avmVK,
      proof: avmProof,
      publicInputs: avmPublicInputs,
    } = await proveAvm(avmCircuitInputs, avmWorkingDirectory, logger));
  });

  beforeEach(async () => {
    workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-rollup-ivc-integration-'));
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
      pub_cols_flattened: mapAvmPublicInputsToNoir(avmPublicInputs),
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
