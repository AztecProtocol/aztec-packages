import { makePrivateKernelInputsInit } from '@aztec/circuits.js';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { Fr } from '@aztec/foundation/fields';

import { executeInit } from './index.js';

describe('Private kernel', () => {
  let logger: DebugLogger;
  beforeAll(() => {
    logger = createDebugLogger('noir-private-kernel');
  });

  it('Executes private kernel init circuit with abi all zeroes (does not crash)', async () => {
    logger('Initialized Noir instance with private kernel init circuit');

    const kernelInputs = makePrivateKernelInputsInit();

    // TODO(Kev): How was this passing with the circuits.wasm version? Maybe it never tested init with mock?
    // Delegate and static calls are not allowed in the init
    kernelInputs.privateCall.callStackItem.publicInputs.callContext.isDelegateCall = false;
    kernelInputs.privateCall.callStackItem.publicInputs.callContext.isStaticCall = false;

    // Tx origin address must equal the storage contract address on the call stack
    kernelInputs.privateCall.callStackItem.contractAddress = kernelInputs.privateCall.callStackItem.publicInputs.callContext.storageContractAddress;
    kernelInputs.txRequest.origin = kernelInputs.privateCall.callStackItem.contractAddress;

    // Tx request function data and args hash must match
    kernelInputs.txRequest.functionData = kernelInputs.privateCall.callStackItem.functionData;
    kernelInputs.txRequest.argsHash = kernelInputs.privateCall.callStackItem.publicInputs.argsHash;

    // Make these 0 so that the circuit does not try to apply constraints on them
    kernelInputs.privateCall.callStackItem.publicInputs.privateCallStack.fill(Fr.ZERO);
    kernelInputs.privateCall.callStackItem.publicInputs.readRequests.fill(Fr.ZERO);
    
    const _kernelOutputs = await executeInit(kernelInputs);

    logger('Executed private kernel init circuit with all zeroes');
  });
});
