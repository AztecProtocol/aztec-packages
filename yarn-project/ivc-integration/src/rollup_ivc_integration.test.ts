import { BB_RESULT, verifyClientIvcProof, writeClientIVCProofToOutputDirectory } from '@aztec/bb-prover';
import { ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS } from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  MockRollupBasePrivateCircuit,
  MockRollupMergeCircuit,
  MockRollupRootCircuit,
  generate3FunctionTestingIVCStack,
  mapRecursiveProofToNoir,
  mapVerificationKeyToNoir,
  witnessGenMockRollupBasePrivateCircuit,
  witnessGenMockRollupMergeCircuit,
  witnessGenMockRollupRootCircuit,
} from './index.js';
import { proveClientIVC, proveKeccakHonk, proveRollupHonk, proveTube } from './prove_native.js';
import type { KernelPublicInputs } from './types/index.js';

/* eslint-disable camelcase */

const logger = createLogger('ivc-integration:test:rollup-native');

describe('Rollup IVC Integration', () => {
  let bbBinaryPath: string;
  let clientIVCProofPath: string;
  let clientIVCPublicInputs: KernelPublicInputs;
  let workingDirectory: string;

  beforeAll(async () => {
    clientIVCProofPath = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-rollup-ivc-integration-client-ivc-'));
    bbBinaryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../barretenberg/cpp/build/bin', 'bb');
    const [bytecodes, witnessStack, tailPublicInputs] = await generate3FunctionTestingIVCStack();
    clientIVCPublicInputs = tailPublicInputs;
    const proof = await proveClientIVC(bbBinaryPath, clientIVCProofPath, witnessStack, bytecodes, logger);
    await writeClientIVCProofToOutputDirectory(proof, clientIVCProofPath);
    const verifyResult = await verifyClientIvcProof(
      bbBinaryPath,
      clientIVCProofPath.concat('/proof'),
      clientIVCProofPath.concat('/vk'),
      logger.info,
    );
    expect(verifyResult.status).toEqual(BB_RESULT.SUCCESS);
  });

  beforeEach(async () => {
    workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-rollup-ivc-integration-'));
    await fs.copyFile(path.join(clientIVCProofPath, 'vk'), path.join(workingDirectory, 'vk'));
    await fs.copyFile(path.join(clientIVCProofPath, 'proof'), path.join(workingDirectory, 'proof'));
  });

  it('Should be able to generate a proof of a 3 transaction rollup', async () => {
    const tubeProof = await proveTube(bbBinaryPath, workingDirectory, logger);

    const baseRollupWitnessResult = await witnessGenMockRollupBasePrivateCircuit({
      tube_data: {
        public_inputs: clientIVCPublicInputs,
        proof: mapRecursiveProofToNoir(tubeProof.proof),
        vk_data: mapVerificationKeyToNoir(
          tubeProof.verificationKey.keyAsFields,
          ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
        ),
      },
    });

    const baseProof = await proveRollupHonk(
      'MockRollupBasePrivateCircuit',
      bbBinaryPath,
      workingDirectory,
      MockRollupBasePrivateCircuit,
      baseRollupWitnessResult.witness,
      logger,
    );

    const baseRollupData = {
      base_or_merge_public_inputs: baseRollupWitnessResult.publicInputs,
      proof: mapRecursiveProofToNoir(baseProof.proof),
      vk: mapVerificationKeyToNoir(
        baseProof.verificationKey.keyAsFields,
        ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
      ),
    };

    const mergeWitnessResult = await witnessGenMockRollupMergeCircuit({ a: baseRollupData, b: baseRollupData });

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

    const rootWitnessResult = await witnessGenMockRollupRootCircuit({ a: baseRollupData, b: mergeRollupData });

    // Three transactions are aggregated
    expect(rootWitnessResult.publicInputs.accumulated).toEqual('0x03');

    // This step takes something like 4 minutes, since it needs to actually prove and remove the IPA claims.
    // If it gets too slow for CI, we can just comment it out.
    await proveKeccakHonk(
      'MockRollupRootCircuit',
      bbBinaryPath,
      workingDirectory,
      MockRollupRootCircuit,
      rootWitnessResult.witness,
      logger,
    );
  }, 300_000);
});
