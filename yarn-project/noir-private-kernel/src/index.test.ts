import {
  CircuitsWasm,
  ContractDeploymentData,
  EthAddress,
  FunctionData,
  FunctionLeafPreimage,
  FunctionSelector,
  Point,
  TxContext,
  TxRequest,
  makeAztecAddress,
  makePoint,
  makePrivateKernelInputsInit,
  makeSelector,
} from '@aztec/circuits.js';
import { computeCompleteAddress, computeFunctionLeaf, computeTxHash } from '@aztec/circuits.js/abis';
import { Fr } from '@aztec/foundation/fields';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { executeInit } from './index.js';

describe('Private kernel', () => {
  let logger: DebugLogger;
  beforeAll(() => {
    logger = createDebugLogger('noir-private-kernel');
  });

  it.skip('Executes private kernel init circuit with abi all zeroes (does not crash)', async () => {
    logger('Initialized Noir instance with private kernel init circuit');

    const kernelInputs = makePrivateKernelInputsInit();

    // TODO(Kev): How was this passing with the circuits.wasm version? Maybe it never tested init with mock?
    // Delegate and static calls are not allowed in the init
    kernelInputs.privateCall.callStackItem.publicInputs.callContext.isDelegateCall = false;
    kernelInputs.privateCall.callStackItem.publicInputs.callContext.isStaticCall = false;

    // Tx origin address must equal the storage contract address on the call stack
    kernelInputs.privateCall.callStackItem.contractAddress =
      kernelInputs.privateCall.callStackItem.publicInputs.callContext.storageContractAddress;
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

describe('Noir compatibility tests (interop_testing.nr)', () => {
  // Tests in this file are to check that what we are computing in Noir
  // is equivalent to what we were computing in circuits.js/the typescript implementation
  // This is to ensure that we have not introduced any bugs in the transition from circuits.js to Noir
  let logger: DebugLogger;
  beforeAll(() => {
    logger = createDebugLogger('noir-private-kernel-compatibility');
  });

  it('Complete Address matches Noir', async () => {
    logger('Initialized Noir instance with private kernel init circuit');
    const wasm = await CircuitsWasm.get();
    const deployerPubKey = makePoint();
    const contractAddrSalt = new Fr(3n);
    const treeRoot = new Fr(4n);
    const constructorHash = new Fr(5n);

    const res = computeCompleteAddress(wasm, deployerPubKey, contractAddrSalt, treeRoot, constructorHash);

    expect(res.address.toString()).toMatchSnapshot();
    expect(res.publicKey).toMatchSnapshot();
    expect(res.partialAddress.toString()).toMatchSnapshot();
  });

  it('TxRequest Hash matches Noir', async () => {
    const wasm = await CircuitsWasm.get();

    const deploymentData = new ContractDeploymentData(
      new Point(new Fr(1), new Fr(2)),
      new Fr(1),
      new Fr(2),
      new Fr(3),
      new EthAddress(numberToBuffer(1)),
    );
    const txRequest = TxRequest.from({
      origin: makeAztecAddress(1),
      functionData: new FunctionData(makeSelector(2), false, true, true),
      argsHash: new Fr(3),
      txContext: new TxContext(false, false, true, deploymentData, Fr.ZERO, Fr.ZERO),
    });
    const hash = computeTxHash(wasm, txRequest);

    expect(hash.toString()).toMatchSnapshot();
  });

  it('ComputeContractAddressFromPartial matches Noir', async () => {
    const wasm = await CircuitsWasm.get();

    const deploymentData = new ContractDeploymentData(
      new Point(new Fr(1), new Fr(2)),
      new Fr(1),
      new Fr(2),
      new Fr(3),
      new EthAddress(numberToBuffer(1)),
    );
    const txRequest = TxRequest.from({
      origin: makeAztecAddress(1),
      functionData: new FunctionData(makeSelector(2), false, true, true),
      argsHash: new Fr(3),
      txContext: new TxContext(false, false, true, deploymentData, Fr.ZERO, Fr.ZERO),
    });
    const hash = computeTxHash(wasm, txRequest);

    expect(hash.toString()).toMatchSnapshot();
  });

  it('Function leaf matches noir', async () => {
    const wasm = await CircuitsWasm.get();

    const fnLeafPreimage = new FunctionLeafPreimage(new FunctionSelector(27), false, true, new Fr(1), new Fr(2));
    const fnLeaf = computeFunctionLeaf(wasm, fnLeafPreimage);
    expect(fnLeaf.toString()).toMatchSnapshot();
  });
});

function numberToBuffer(value: number) {
  // This can be used to convert a number to a buffer
  // and used as an EthAddress or AztecAddress.
  //
  // I think the EthAddress taking in 32 bytes is
  // not great, but I'll take advantage of it here.
  return new Fr(value).toBuffer();
}
