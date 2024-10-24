import { BB_RESULT, executeBbClientIvcProveAndVerify } from '@aztec/bb-prover';
import { ClientIvcProof } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { encode } from '@msgpack/msgpack';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  MOCK_MAX_COMMITMENTS_PER_TX,
  MockAppCreatorCircuit,
  MockAppReaderCircuit,
  MockPrivateKernelInitCircuit,
  MockPrivateKernelInnerCircuit,
  MockPrivateKernelResetCircuit,
  MockPrivateKernelTailCircuit,
  witnessGenCreatorAppMockCircuit,
  witnessGenMockPrivateKernelInitCircuit,
  witnessGenMockPrivateKernelInnerCircuit,
  witnessGenMockPrivateKernelResetCircuit,
  witnessGenMockPrivateKernelTailCircuit,
  witnessGenReaderAppMockCircuit,
} from './index.js';

/* eslint-disable camelcase */

const logger = createDebugLogger('aztec:clientivc-integration');

jest.setTimeout(120_000);

describe('Client IVC Integration', () => {
  let bbWorkingDirectory: string;
  let bbBinaryPath: string;

  beforeEach(async () => {
    // Create a temp working dir
    bbWorkingDirectory = await fs.mkdtemp(path.join('/mnt/user-data/cody/bb-tmp/', 'bb-client-ivc-integration-'));
    bbBinaryPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../barretenberg/ts/dest/node',
      'main.js',
    );
    logger.debug(`bbBinaryPath is ${bbBinaryPath}`);
  });

  async function proveAndVerifyAztecClient(witnessStack: Uint8Array[], bytecodes: string[]): Promise<boolean> {
    await fs.writeFile(
      path.join(bbWorkingDirectory, 'acir.msgpack'),
      encode(bytecodes.map(bytecode => Buffer.from(bytecode, 'base64'))),
    );
    logger.debug('wrote acir.msgpack');

    await fs.writeFile(path.join(bbWorkingDirectory, 'witnesses.msgpack'), encode(witnessStack));
    logger.debug('wrote witnesses.msgpack');

    const provingResult = await executeBbClientIvcProveAndVerify(
      bbBinaryPath,
      bbWorkingDirectory,
      path.join(bbWorkingDirectory, 'acir.msgpack'),
      path.join(bbWorkingDirectory, 'witnesses.msgpack'),
      logger.info,
    );

    if (provingResult.status === BB_RESULT.FAILURE) {
      throw new Error(provingResult.reason);
    } else {
      return true
    }
  }

  // This test will verify a client IVC proof of a simple tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run the tail kernel to finish the client IVC chain.
  it('Should generate a verifiable client IVC proof from a simple mock tx via bb.js', async () => {
    const tx = {
      number_of_calls: '0x1',
    };
    // Witness gen app and kernels
    const appWitnessGenResult = await witnessGenCreatorAppMockCircuit({ commitments_to_create: ['0x1', '0x2'] });
    logger.debug('generated app mock circuit witness');

    const initWitnessGenResult = await witnessGenMockPrivateKernelInitCircuit({
      app_inputs: appWitnessGenResult.publicInputs,
      tx,
    });
    logger.debug('generated mock private kernel init witness');

    const tailWitnessGenResult = await witnessGenMockPrivateKernelTailCircuit({
      prev_kernel_public_inputs: initWitnessGenResult.publicInputs,
    });
    logger.debug('generated mock private kernel tail witness');

    // Create client IVC proof
    const bytecodes = [
      MockAppCreatorCircuit.bytecode,
      MockPrivateKernelInitCircuit.bytecode,
      MockPrivateKernelTailCircuit.bytecode,
    ];
    logger.debug('built bytecode array');
    const witnessStack = [appWitnessGenResult.witness, initWitnessGenResult.witness, tailWitnessGenResult.witness];
    logger.debug('built witness stack');

    const verifyResult = await proveAndVerifyAztecClient(witnessStack, bytecodes);
    logger.debug('generated and verified proof');

    expect(verifyResult).toEqual(true);
  });
});
