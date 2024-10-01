import {
  type BBSuccess,
  BB_RESULT,
  generateAvmProof,
  generateProof,
  getPublicInputs,
  verifyProof,
} from '@aztec/bb-prover';
import { AvmCircuitInputs, FunctionSelector, Gas, GlobalVariables } from '@aztec/circuits.js';
import {
  AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_PUBLIC_COLUMN_MAX_SIZE,
  AVM_PUBLIC_INPUTS_FLATTENED_SIZE,
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH,
} from '@aztec/circuits.js/constants';
import { makeContractClassPublic } from '@aztec/circuits.js/testing';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import { type FixedLengthArray } from '@aztec/noir-protocol-circuits-types/types';
import { AvmSimulator, PublicSideEffectTrace, type WorldStateDB } from '@aztec/simulator';
import {
  getAvmTestContractBytecode,
  initContext,
  initExecutionEnvironment,
  initPersistableStateManager,
  resolveAvmTestContractAssertionMessage,
} from '@aztec/simulator/avm/fixtures';
import { SerializableContractInstance } from '@aztec/types/contracts';

import { jest } from '@jest/globals';
import fs from 'fs/promises';
import { mock } from 'jest-mock-extended';
import { tmpdir } from 'node:os';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { MockPublicKernelCircuit, witnessGenMockPublicKernelCircuit } from './index.js';

// Auto-generated types from noir are not in camel case.
/* eslint-disable camelcase */

jest.setTimeout(180_000);

const logger = createDebugLogger('aztec:avm-integration');

describe('AVM Integration', () => {
  let bbWorkingDirectory: string;
  let bbBinaryPath: string;

  beforeEach(async () => {
    //Create a temp working dir
    bbWorkingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-avm-integration-'));
    bbBinaryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../barretenberg/cpp/build/bin', 'bb');
  });

  async function createHonkProof(witness: Uint8Array, bytecode: string): Promise<BBSuccess> {
    const witnessFileName = path.join(bbWorkingDirectory, 'witnesses.gz');
    await fs.writeFile(witnessFileName, witness);

    const provingResult = await generateProof(
      bbBinaryPath,
      bbWorkingDirectory,
      'mock-public-kernel',
      Buffer.from(bytecode, 'base64'),
      witnessFileName,
      'ultra_honk',
      logger.info,
    );

    expect(provingResult.status).toBe(BB_RESULT.SUCCESS);
    return provingResult as BBSuccess;
  }

  it('Should generate and verify an ultra honk proof from an AVM verification', async () => {
    const bbSuccess = await proveAvmTestContract(
      'bulk_testing',
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x)),
    );

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

    const witGenResult = await witnessGenMockPublicKernelCircuit({
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

    await createHonkProof(witGenResult.witness, MockPublicKernelCircuit.bytecode);

    const verifyResult = await verifyProof(
      bbBinaryPath,
      path.join(bbWorkingDirectory, 'proof'),
      path.join(bbWorkingDirectory, 'vk'),
      'ultra_honk',
      logger.info,
    );

    expect(verifyResult.status).toBe(BB_RESULT.SUCCESS);
  });
});

// Helper

const proveAvmTestContract = async (
  functionName: string,
  calldata: Fr[] = [],
  assertionErrString?: string,
): Promise<BBSuccess> => {
  const worldStateDB = mock<WorldStateDB>();
  const startSideEffectCounter = 0;
  const functionSelector = FunctionSelector.random();
  const globals = GlobalVariables.empty();
  const environment = initExecutionEnvironment({ functionSelector, calldata, globals });

  const contractInstance = new SerializableContractInstance({
    version: 1,
    salt: new Fr(0x123),
    deployer: new Fr(0x456),
    contractClassId: new Fr(0x789),
    initializationHash: new Fr(0x101112),
    publicKeysHash: new Fr(0x161718),
  }).withAddress(environment.address);
  worldStateDB.getContractInstance.mockResolvedValue(contractInstance);

  const contractClass = makeContractClassPublic();
  worldStateDB.getContractClass.mockResolvedValue(contractClass);

  const storageValue = new Fr(5);
  worldStateDB.storageRead.mockResolvedValue(storageValue);

  const trace = new PublicSideEffectTrace(startSideEffectCounter);
  const persistableState = initPersistableStateManager({ worldStateDB, trace });
  const context = initContext({ env: environment, persistableState });
  const bytecode = getAvmTestContractBytecode(functionName);
  jest.spyOn(worldStateDB, 'getBytecode').mockResolvedValue(bytecode);

  const startGas = new Gas(context.machineState.gasLeft.daGas, context.machineState.gasLeft.l2Gas);

  // Use a simple contract that emits a side effect
  // The paths for the barretenberg binary and the write path are hardcoded for now.
  const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb');
  const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));
  // First we simulate (though it's not needed in this simple case).
  const simulator = new AvmSimulator(context);
  const avmResult = await simulator.execute();

  if (assertionErrString == undefined) {
    expect(avmResult.reverted).toBe(false);
  } else {
    // Explicit revert when an assertion failed.
    expect(avmResult.reverted).toBe(true);
    expect(avmResult.revertReason).toBeDefined();
    expect(resolveAvmTestContractAssertionMessage(functionName, avmResult.revertReason!)).toContain(assertionErrString);
  }

  const pxResult = trace.toPublicExecutionResult(
    environment,
    startGas,
    /*endGasLeft=*/ Gas.from(context.machineState.gasLeft),
    /*bytecode=*/ simulator.getBytecode()!,
    avmResult,
    functionName,
  );

  const avmCircuitInputs = new AvmCircuitInputs(
    functionName,
    /*calldata=*/ context.environment.calldata,
    /*publicInputs=*/ getPublicInputs(pxResult),
    /*avmHints=*/ pxResult.avmCircuitHints,
  );

  // Then we prove.
  const proofRes = await generateAvmProof(bbPath, bbWorkingDirectory, avmCircuitInputs, logger.info);
  expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);

  return proofRes as BBSuccess;
};
