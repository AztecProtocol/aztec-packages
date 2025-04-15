import { BB_RESULT, verifyClientIvcProof, writeClientIVCProofToOutputDirectory } from '@aztec/bb-prover';
import { ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS, TUBE_PROOF_LENGTH } from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { PublicTxSimulationTester } from '@aztec/simulator/public/fixtures';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { ProofAndVerificationKey } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  MockRollupBasePublicCircuit,
  generate3FunctionTestingIVCStack,
  mapAvmProofToNoir,
  mapAvmPublicInputsToNoir,
  mapAvmVerificationKeyToNoir,
  mapRecursiveProofToNoir,
  mapVerificationKeyToNoir,
  simulateAvmBulkTesting,
  witnessGenMockPublicBaseCircuit,
} from './index.js';
import { proveAvm, proveClientIVC, proveRollupHonk, proveTube } from './prove_native.js';
import type { KernelPublicInputs } from './types/index.js';

// Auto-generated types from noir are not in camel case.
/* eslint-disable camelcase */

jest.setTimeout(120_000);

const logger = createLogger('ivc-integration:test:avm-integration');

describe('AVM Integration', () => {
  let bbWorkingDirectory: string;
  let bbBinaryPath: string;
  let tubeProof: ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>;
  let clientIVCPublicInputs: KernelPublicInputs;

  let avmTestContractInstance: ContractInstanceWithAddress;

  let simTester: PublicTxSimulationTester;

  beforeAll(async () => {
    const clientIVCProofPath = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-avm-integration-client-ivc-'));
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
    tubeProof = await proveTube(bbBinaryPath, clientIVCProofPath, logger);
  });

  beforeEach(async () => {
    //Create a temp working dir
    bbWorkingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-avm-integration-'));

    simTester = await PublicTxSimulationTester.create();
    avmTestContractInstance = await simTester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
  });

  it('Should generate and verify an ultra honk proof from an AVM verification', async () => {
    // Get a deployed contract instance to pass to the contract
    // for it to use as "expected" values when testing contract instance retrieval.
    const expectContractInstance = avmTestContractInstance;

    const simRes = await simulateAvmBulkTesting(simTester, expectContractInstance);

    const avmCircuitInputs = simRes.avmProvingRequest.inputs;
    const { vk, proof, publicInputs } = await proveAvm(avmCircuitInputs, bbWorkingDirectory, logger);

    logger.debug('Avm public inputs', mapAvmPublicInputsToNoir(publicInputs));

    const baseWitnessResult = await witnessGenMockPublicBaseCircuit({
      tube_data: {
        public_inputs: clientIVCPublicInputs,
        proof: mapRecursiveProofToNoir(tubeProof.proof),
        vk_data: mapVerificationKeyToNoir(
          tubeProof.verificationKey.keyAsFields,
          ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
        ),
      },
      verification_key: mapAvmVerificationKeyToNoir(vk),
      proof: mapAvmProofToNoir(proof),
      pub_cols_flattened: mapAvmPublicInputsToNoir(publicInputs),
    });

    await proveRollupHonk(
      'MockRollupBasePublicCircuit',
      bbBinaryPath,
      bbWorkingDirectory,
      MockRollupBasePublicCircuit,
      baseWitnessResult.witness,
      logger,
    );
  }, 240_000);
});
