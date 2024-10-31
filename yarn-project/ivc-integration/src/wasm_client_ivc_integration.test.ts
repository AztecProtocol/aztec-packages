import { createDebugLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { ungzip } from 'pako';

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
  beforeEach(async () => {});

  function base64ToUint8Array(base64: string) {
    let binaryString = atob(base64);
    let len = binaryString.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async function proveAndVerifyAztecClient(
    witnessStack: Uint8Array[],
    bytecodes: string[],
    threads?: number,
  ): Promise<boolean> {
    const { AztecClientBackend } = await import('@aztec/bb.js');
    const backend = new AztecClientBackend(
      bytecodes.map(base64ToUint8Array).map((arr: Uint8Array) => ungzip(arr)),
      { threads },
    );

    const verified = await backend.proveAndVerify(witnessStack.map((arr: Uint8Array) => ungzip(arr)));
    console.log(`finished running proveAndVerify ${verified}`);
    await backend.destroy();
    return verified;
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
    logger.debug(`generated and verified proof. result: ${verifyResult}`);

    expect(verifyResult).toEqual(true);
  });
});
