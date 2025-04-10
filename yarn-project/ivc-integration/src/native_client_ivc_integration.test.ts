import {
  BB_RESULT,
  executeBbClientIvcProof,
  readFromOutputDirectory,
  verifyClientIvcProof,
  writeToOutputDirectory,
} from '@aztec/bb-prover';
import { createLogger } from '@aztec/foundation/log';
import type { ClientIvcProof } from '@aztec/stdlib/proofs';

import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { generate3FunctionTestingIVCStack, generate6FunctionTestingIVCStack } from './index.js';
import vk from '../artifacts/keys/app_creator.vk.data.json';
import { Encoder } from 'msgpackr';

/* eslint-disable camelcase */

const logger = createLogger('ivc-integration:test:native');

jest.setTimeout(120_000);

describe('Client IVC Integration', () => {
  let bbWorkingDirectory: string;
  let bbBinaryPath: string;

  beforeEach(async () => {
    // Create a temp working dir
    bbWorkingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-client-ivc-integration-'));
    bbBinaryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../barretenberg/cpp/build/bin', 'bb');
  });

  async function createClientIvcProof(witnessStack: Uint8Array[], bytecodes: string[]): Promise<ClientIvcProof> {
    const ivcInputsPath = path.join(bbWorkingDirectory, 'ivc-inputs.msgpack');
    const ivcInputs = witnessStack.map((witness, i) => ({ functionName: "", bytecode: Buffer.from(bytecodes[i], 'base64'), witness, vk: Buffer.from([]) }));
    await fs.writeFile(
      ivcInputsPath,
      new Encoder().pack(ivcInputs),
    );

    const provingResult = await executeBbClientIvcProof(
      bbBinaryPath,
      bbWorkingDirectory,
      ivcInputsPath,
      logger.info,
    );

    if (provingResult.status === BB_RESULT.FAILURE) {
      throw new Error(provingResult.reason);
    }

    return readFromOutputDirectory(bbWorkingDirectory);
  }

  // This test will verify a client IVC proof of a simple tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run the tail kernel to finish the client IVC chain.
  it.skip('Should generate a verifiable client IVC proof from a simple mock tx', async () => {
    const [bytecodes, witnessStack] = await generate3FunctionTestingIVCStack();

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1296)
    // These tests were left mysteriously failing. Once the prove step is fixed, this also needs to use the constant vk's.
    const proof = await createClientIvcProof(witnessStack, bytecodes);
    await writeToOutputDirectory(proof, bbWorkingDirectory);
    const verifyResult = await verifyClientIvcProof(
      bbBinaryPath,
      bbWorkingDirectory.concat('/proof'),
      bbWorkingDirectory.concat('/vk'),
      logger.info,
    );

    expect(verifyResult.status).toEqual(BB_RESULT.SUCCESS);
  });

  // This test will verify a client IVC proof of a more complex tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run a mock app that reads one of those commitments
  // 4. Run the inner kernel to process the second app run
  // 5. Run the reset kernel to process the read request emitted by the reader app
  // 6. Run the tail kernel to finish the client IVC chain
  it.skip('Should generate a verifiable client IVC proof from a complex mock tx', async () => {
    const [bytecodes, witnessStack] = await generate6FunctionTestingIVCStack();

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1296)
    // These tests were left mysteriously failing. Once the prove step is fixed, this also needs to use the constant vk's.
    const proof = await createClientIvcProof(witnessStack, bytecodes);
    await writeToOutputDirectory(proof, bbWorkingDirectory);
    const verifyResult = await verifyClientIvcProof(
      bbBinaryPath,
      bbWorkingDirectory.concat('/proof'),
      bbWorkingDirectory.concat('/vk'),
      logger.info,
    );

    expect(verifyResult.status).toEqual(BB_RESULT.SUCCESS);
  });
});
