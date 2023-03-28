import { CircuitsWasm } from '../wasm/index.js';
import { Buffer } from 'buffer';
import { serializeBufferArrayToVector } from '@aztec/foundation';

export function abisHashTxRequest(wasm: CircuitsWasm, txRequest: Uint8Array) {
  wasm.writeMemory(0, txRequest);
  wasm.call('abis__hash_tx_request', 0, txRequest.length);
  return Buffer.from(wasm.getMemorySlice(txRequest.length, 32));
}

export function computeFunctionSelector(wasm: CircuitsWasm, funcSig: string) {
  const buf = Buffer.from(funcSig);
  wasm.writeMemory(0, buf);
  wasm.call('abis__compute_function_selector', 0, buf.length);
  return Buffer.from(wasm.getMemorySlice(buf.length, 4));
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
