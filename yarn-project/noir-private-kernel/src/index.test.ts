import { makePrivateKernelInputsInit } from '@aztec/circuits.js';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { executeInit } from './index.js';

describe('Private kernel', () => {
  let logger: DebugLogger;
  beforeAll(() => {
    logger = createDebugLogger('noir-private-kernel');
  });

  it('Executes private kernel init circuit with abi all zeroes (does not crash)', async () => {
    logger('Initialized Noir instance with private kernel init circuit');

    const kernelInputs = makePrivateKernelInputsInit();
    const _kernelOutputs = await executeInit(kernelInputs);

    logger('Executed private kernel init circuit with all zeroes');
  });
});
