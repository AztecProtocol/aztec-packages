import { type BBSuccess, BB_RESULT, generateProof, verifyProof } from '@aztec/bb-prover';
import { proveAvmTestContract } from '@aztec/bb-prover';
import {
  AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH,
} from '@aztec/circuits.js/constants';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import { type FixedLengthArray } from '@aztec/noir-protocol-circuits-types/types';

import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { MockPublicKernelCircuit, witnessGenMockPublicKernelCircuit } from './index.js';

// Auto-generated types from noir are not in camel case.
/* eslint-disable camelcase */

jest.setTimeout(120_000);

describe('AVM Integration', () => {
  const logger = createDebugLogger('aztec:avm-integration');

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
    const bbSuccess = await proveAvmTestContract('new_note_hash', [new Fr(1)]);

    const avmProofPath = bbSuccess.proofPath;
    const avmVkPath = bbSuccess.vkPath;
    expect(avmProofPath).toBeDefined();
    expect(avmVkPath).toBeDefined();

    // Read the binary proof
    const avmProofBuffer = await fs.readFile(avmProofPath!);
    const reader = BufferReader.asReader(avmProofBuffer);
    reader.readArray(PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH, Fr);
    const calldataSize = Fr.fromBuffer(reader).toNumber();
    reader.readArray(calldataSize, Fr);
    const returnDataSize = Fr.fromBuffer(reader).toNumber();
    reader.readArray(returnDataSize, Fr);

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
