import { BB_RESULT, verifyClientIvcProof, writeClientIVCProofToOutputDirectory } from '@aztec/bb-prover';
import {
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
  ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  TUBE_PROOF_LENGTH,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { mapAvmCircuitPublicInputsToNoir } from '@aztec/noir-protocol-circuits-types/server';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { PublicTxSimulationTester, createAvmMinimalPublicTx } from '@aztec/simulator/public/fixtures';
import type { AvmCircuitInputs } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { ProofAndVerificationKey } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

import { getWorkingDirectory } from './bb_working_directory.js';
import {
  MockRollupBasePublicCircuit,
  generate3FunctionTestingIVCStack,
  mapAvmProofToNoir,
  mapRecursiveProofToNoir,
  mapVerificationKeyToNoir,
  witnessGenMockPublicBaseCircuit,
} from './index.js';
import { proveAvm, proveClientIVC, proveRollupHonk, proveTube } from './prove_native.js';
import type { KernelPublicInputs } from './types/index.js';

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
      vk_data: mapVerificationKeyToNoir(
        tubeProof.verificationKey.keyAsFields,
        ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
      ),
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

  let avmTestContractInstance: ContractInstanceWithAddress;

  let simTester: PublicTxSimulationTester;

  beforeAll(async () => {
    const clientIVCProofPath = await getWorkingDirectory('bb-avm-integration-client-ivc-');
    bbBinaryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../barretenberg/cpp/build/bin', 'bb');
    const [bytecodes, witnessStack, tailPublicInputs, vks] = await generate3FunctionTestingIVCStack();
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
    avmTestContractInstance = await simTester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
  });

  it('Should generate and verify an ultra honk proof from an AVM verification of the bulk test', async () => {
    // Get a deployed contract instance to pass to the contract
    // for it to use as "expected" values when testing contract instance retrieval.
    const expectContractInstance = avmTestContractInstance;

    const argsField = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const argsU8 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const args = [
      argsField,
      argsU8,
      /*getInstanceForAddress=*/ expectContractInstance.address.toField(),
      /*expectedDeployer=*/ expectContractInstance.deployer.toField(),
      /*expectedClassId=*/ expectContractInstance.currentContractClassId.toField(),
      /*expectedInitializationHash=*/ expectContractInstance.initializationHash.toField(),
    ];

    const simRes = await simTester.simulateTx(
      /*sender=*/ AztecAddress.fromNumber(42),
      /*setupCalls=*/ [],
      /*appCalls=*/ [{ address: expectContractInstance.address, fnName: 'bulk_testing', args }],
      /*teardownCall=*/ undefined,
    );

    const avmCircuitInputs = simRes.avmProvingRequest.inputs;

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
