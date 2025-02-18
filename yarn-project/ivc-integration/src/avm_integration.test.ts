import { type BBSuccess, BB_RESULT, generateAvmProof, generateProof, verifyProof } from '@aztec/bb-prover';
import {
  type AvmCircuitInputs,
  AztecAddress,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  FunctionSelector,
} from '@aztec/circuits.js';
import {
  AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_PUBLIC_COLUMN_MAX_SIZE,
  AVM_PUBLIC_INPUTS_FLATTENED_SIZE,
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH,
  PUBLIC_DISPATCH_SELECTOR,
} from '@aztec/circuits.js/constants';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { type FixedLengthArray } from '@aztec/noir-protocol-circuits-types/types';
import { PublicTxSimulationTester, getAvmTestContractPublicDispatchBytecode } from '@aztec/simulator/public/fixtures';

import { promises as fs } from 'fs';
import { tmpdir } from 'node:os';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { MockPublicBaseCircuit, witnessGenMockPublicBaseCircuit } from './index.js';

// Auto-generated types from noir are not in camel case.
/* eslint-disable camelcase */

const logger = createLogger('ivc-integration:test:avm-integration');

describe('AVM Integration', () => {
  let bbWorkingDirectory: string;
  let bbBinaryPath: string;

  const avmTestContractClassSeed = 0;
  const avmTestContractBytecode = getAvmTestContractPublicDispatchBytecode();
  let avmTestContractClass: ContractClassPublic;
  let avmTestContractInstance: ContractInstanceWithAddress;
  let avmTestContractAddress: AztecAddress;

  let simTester: PublicTxSimulationTester;

  beforeEach(async () => {
    //Create a temp working dir
    bbWorkingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-avm-integration-'));
    bbBinaryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../barretenberg/cpp/build/bin', 'bb');

    avmTestContractClass = await makeContractClassPublic(
      /*seed=*/ avmTestContractClassSeed,
      /*publicDispatchFunction=*/ {
        bytecode: avmTestContractBytecode,
        selector: new FunctionSelector(PUBLIC_DISPATCH_SELECTOR),
      },
    );
    avmTestContractInstance = await makeContractInstanceFromClassId(
      avmTestContractClass.id,
      /*seed=*/ avmTestContractClassSeed,
    );
    avmTestContractAddress = avmTestContractInstance.address;

    simTester = await PublicTxSimulationTester.create();
    await simTester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
    await simTester.addContractInstance(avmTestContractInstance);
  });

  async function createHonkProof(witness: Uint8Array, bytecode: string): Promise<BBSuccess> {
    const witnessFileName = path.join(bbWorkingDirectory, 'witnesses.gz');
    await fs.writeFile(witnessFileName, witness);
    const recursive = false;
    const provingResult = await generateProof(
      bbBinaryPath,
      bbWorkingDirectory,
      'mock-public-base',
      Buffer.from(bytecode, 'base64'),
      recursive,
      witnessFileName,
      'ultra_honk',
      logger.info,
    );

    expect(provingResult.status).toBe(BB_RESULT.SUCCESS);
    return provingResult as BBSuccess;
  }

  // TODO: Skipping for now as per Davids advice.
  it.skip('Should generate and verify an ultra honk proof from an AVM verification', async () => {
    // Get a deployed contract instance to pass to the contract
    // for it to use as "expected" values when testing contract instance retrieval.
    const expectContractInstance = avmTestContractInstance;
    const argsField = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const argsU8 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const args = [
      ...argsField,
      ...argsU8,
      /*getInstanceForAddress=*/ expectContractInstance.address.toField(),
      /*expectedDeployer=*/ expectContractInstance.deployer.toField(),
      /*expectedClassId=*/ expectContractInstance.currentContractClassId.toField(),
      /*expectedInitializationHash=*/ expectContractInstance.initializationHash.toField(),
    ].map(x => new Fr(x));
    const simRes = await simTester.simulateTx(
      /*sender=*/ AztecAddress.fromNumber(42),
      /*setupCalls=*/ [],
      /*appCalls=*/ [{ address: avmTestContractAddress, fnName: 'bulk_testing', args }],
    );
    const avmCircuitInputs = simRes.avmProvingRequest.inputs;
    const bbSuccess = await proveAvm(avmCircuitInputs);

    const avmProofPath = bbSuccess.proofPath;
    const avmVkPath = bbSuccess.vkPath;
    expect(avmProofPath).toBeDefined();
    expect(avmVkPath).toBeDefined();

    // Read the binary proof
    const avmProofBuffer = await fs.readFile(avmProofPath!);
    const reader = BufferReader.asReader(avmProofBuffer);
    const kernel_public_inputs = reader.readArray(PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH, Fr);
    const calldataSize = Fr.fromBuffer(reader).toNumber();
    const calldata = reader.readArray(calldataSize, Fr);
    const returnDataSize = Fr.fromBuffer(reader).toNumber();
    const returnData = reader.readArray(returnDataSize, Fr);

    const public_cols_flattened = kernel_public_inputs
      .concat(calldata)
      .concat(Array(AVM_PUBLIC_COLUMN_MAX_SIZE - calldata.length).fill(new Fr(0)))
      .concat(returnData)
      .concat(Array(AVM_PUBLIC_COLUMN_MAX_SIZE - returnData.length).fill(new Fr(0)));

    expect(public_cols_flattened.length).toBe(AVM_PUBLIC_INPUTS_FLATTENED_SIZE);

    const proof: Fr[] = [];
    while (!reader.isEmpty()) {
      proof.push(Fr.fromBuffer(reader));
    }
    expect(proof.length).toBe(AVM_PROOF_LENGTH_IN_FIELDS);

    // Read the key
    const vkBuffer = await fs.readFile(path.join(avmVkPath!, 'vk'));
    const vkReader = BufferReader.asReader(vkBuffer);
    const vk = vkReader.readArray(AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS, Fr);
    expect(vk.length).toBe(AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS);

    const witGenResult = await witnessGenMockPublicBaseCircuit({
      verification_key: vk.map(x => x.toString()) as FixedLengthArray<
        string,
        typeof AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS
      >,
      proof: proof.map(x => x.toString()) as FixedLengthArray<string, typeof AVM_PROOF_LENGTH_IN_FIELDS>,
      pub_cols_flattened: public_cols_flattened.map(x => x.toString()) as FixedLengthArray<
        string,
        typeof AVM_PUBLIC_INPUTS_FLATTENED_SIZE
      >,
    });

    await createHonkProof(witGenResult.witness, MockPublicBaseCircuit.bytecode);

    const verifyResult = await verifyProof(
      bbBinaryPath,
      path.join(bbWorkingDirectory, 'proof'),
      path.join(bbWorkingDirectory, 'vk'),
      'ultra_honk',
      logger,
    );

    expect(verifyResult.status).toBe(BB_RESULT.SUCCESS);
  }, 240_000);
});

async function proveAvm(avmCircuitInputs: AvmCircuitInputs): Promise<BBSuccess> {
  const internalLogger = createLogger('ivc-integration:test:avm-proving');

  // The paths for the barretenberg binary and the write path are hardcoded for now.
  const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb');
  const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

  // Then we prove.
  const proofRes = await generateAvmProof(bbPath, bbWorkingDirectory, avmCircuitInputs, internalLogger);
  if (proofRes.status === BB_RESULT.FAILURE) {
    internalLogger.error(`Proof generation failed: ${proofRes.reason}`);
  }
  expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);

  return proofRes as BBSuccess;
}
