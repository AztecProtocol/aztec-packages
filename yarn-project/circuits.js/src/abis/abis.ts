import { AztecAddress, serializeBufferArrayToVector } from '@aztec/foundation';
import { Buffer } from 'buffer';
import { CircuitsWasm } from '../wasm/index.js';
import { FUNCTION_SELECTOR_NUM_BYTES, TxRequest } from '../index.js';

export function hashTxRequest(wasm: CircuitsWasm, txRequest: TxRequest) {
  // const inputPtr = wasm.call('bbmalloc', txReqBuf.length);
  // const outputMem = wasm.call('bbmalloc', 32);
  // wasm.writeMemory(inputPtr, txReqBuf);
  // const resultPtr = wasm.call('abis__hash_tx_request', inputPtr, outputMem);
  // const resultData = Buffer.from(wasm.getMemorySlice(resultPtr, resultPtr + 32));
  // return resultData;
  // const resBuf =
  // const mem = wasm.call('bbmalloc', 32);
  const data = txRequest.toBuffer();
  console.log(1);
  wasm.writeMemory(0, data);
  console.log(2);
  wasm.call('abis__hash_tx_request', 0, data.length);
  console.log(3);
  return Buffer.from(wasm.getMemorySlice(data.length, data.length + 32));
}

export function computeFunctionSelector(wasm: CircuitsWasm, funcSig: string) {
  const buf = Buffer.from(funcSig);
  wasm.writeMemory(0, buf);
  wasm.call('abis__compute_function_selector', 0, buf.length);
  return Buffer.from(wasm.getMemorySlice(buf.length, buf.length + FUNCTION_SELECTOR_NUM_BYTES));
}

export function hashVK(wasm: CircuitsWasm, vkBuf: Uint8Array) {
  wasm.writeMemory(0, vkBuf);
  wasm.call('abis__hash_vk', 0, vkBuf.length);
  return Buffer.from(wasm.getMemorySlice(vkBuf.length, 32));
}

export function computeFunctionLeaf(wasm: CircuitsWasm, fnLeaf: Uint8Array) {
  wasm.writeMemory(0, fnLeaf);
  wasm.call('abis__compute_function_leaf', fnLeaf.length);
  return Buffer.from(wasm.getMemorySlice(fnLeaf.length, 32));
}

export function computeFunctionTreeRoot(wasm: CircuitsWasm, fnLeafs: Buffer[]) {
  const inputVector = serializeBufferArrayToVector(fnLeafs);
  wasm.writeMemory(0, inputVector);
  wasm.call('abis__compute_function_tree_root', 0, fnLeafs.length);
  return Buffer.from(wasm.getMemorySlice(inputVector.length, 32));
}

export function hashConstructor(wasm: CircuitsWasm, funcSigBuf: Uint8Array, args: Buffer[], constructorVK: Uint8Array) {
  const inputVector = serializeBufferArrayToVector(args);
  wasm.writeMemory(0, funcSigBuf);
  wasm.writeMemory(funcSigBuf.length, inputVector);
  wasm.writeMemory(funcSigBuf.length + inputVector.length, constructorVK);
  wasm.call('abis__hash_constructor', 0, funcSigBuf.length, funcSigBuf.length + inputVector.length);
  const memLoc = funcSigBuf.length + inputVector.length + constructorVK.length;
  return Buffer.from(wasm.getMemorySlice(memLoc, 32));
}

export function computeContractAddress(
  wasm: CircuitsWasm,
  deployerAddr: AztecAddress,
  contractAddr: AztecAddress,
  fnTreeRoot: Buffer,
  constructorHash: Buffer,
) {
  const deployerAddrBuf = deployerAddr.toBuffer();
  const contractAddrBuf = contractAddr.toBuffer();
  const memLoc1 = deployerAddrBuf.length;
  const memLoc2 = memLoc1 + contractAddrBuf.length;
  const memLoc3 = memLoc2 + fnTreeRoot.length;
  const memLoc4 = memLoc3 + constructorHash.length;
  wasm.writeMemory(0, deployerAddrBuf);
  wasm.writeMemory(memLoc1, contractAddrBuf);
  wasm.writeMemory(memLoc2, fnTreeRoot);
  wasm.writeMemory(memLoc3, constructorHash);
  wasm.call('abis__compute_contract_address', 0, memLoc1, memLoc2, memLoc3);
  const resultBuf = Buffer.from(wasm.getMemorySlice(memLoc4, 32));
  return AztecAddress.fromBuffer(resultBuf);
}

export function computeContractLeaf(wasm: CircuitsWasm, leafPreimage: Buffer) {
  wasm.writeMemory(0, leafPreimage);
  wasm.call('abis__compute_contract_leaf', 0);
  return Buffer.from(wasm.getMemorySlice(leafPreimage.length, 32));
}
