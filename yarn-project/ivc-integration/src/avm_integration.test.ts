import { type BBSuccess, BB_RESULT, generateAvmProof, generateProof, verifyProof } from '@aztec/bb-prover';
import {
  AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_PUBLIC_COLUMN_MAX_SIZE,
  AVM_PUBLIC_INPUTS_FLATTENED_SIZE,
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH,
} from '@aztec/circuits.js/constants';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import { type FixedLengthArray } from '@aztec/noir-protocol-circuits-types/types';
import { simulateAvmTestContractGenerateCircuitInputs } from '@aztec/simulator/public/fixtures';

import fs from 'fs/promises';
import { tmpdir } from 'node:os';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { MockPublicBaseCircuit, witnessGenMockPublicBaseCircuit } from './index.js';

// Auto-generated types from noir are not in camel case.
/* eslint-disable camelcase */
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
      logger.info,
    );

    expect(verifyResult.status).toBe(BB_RESULT.SUCCESS);
  }, 240_000);
});

async function proveAvmTestContract(functionName: string, calldata: Fr[] = []): Promise<BBSuccess> {
  const avmCircuitInputs = await simulateAvmTestContractGenerateCircuitInputs(functionName, calldata);

  const internalLogger = createDebugLogger('aztec:avm-proving-test');
  const logger = (msg: string, _data?: any) => internalLogger.verbose(msg);

  // The paths for the barretenberg binary and the write path are hardcoded for now.
  const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb');
  const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

  // Then we prove.
  const proofRes = await generateAvmProof(bbPath, bbWorkingDirectory, avmCircuitInputs, logger);
  if (proofRes.status === BB_RESULT.FAILURE) {
    internalLogger.error(`Proof generation failed: ${proofRes.reason}`);
  }
  expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);

  return proofRes as BBSuccess;
}
