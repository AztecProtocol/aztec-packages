import { pedersenCompressInputs } from '@aztec/barretenberg.js/crypto';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { CircuitsWasm, NewContractData, PrivateKernelPublicInputs, UInt8Vector } from '@aztec/circuits.js';
import { Tx } from '@aztec/tx';

function makeEmptyProof() {
  return new UInt8Vector(Buffer.alloc(0));
}

function makeEmptyUnverifiedData() {
  return Buffer.alloc(0);
}

export function makeEmptyTx(): Tx {
  const isEmpty = true;
  return new Tx(PrivateKernelPublicInputs.makeEmpty(), makeEmptyProof(), makeEmptyUnverifiedData(), isEmpty);
}

export function hashNewContractData(wasm: CircuitsWasm | BarretenbergWasm, cd: NewContractData) {
  if (cd.contractAddress.isZero() && cd.portalContractAddress.isZero() && cd.functionTreeRoot.isZero()) {
    return Buffer.alloc(32, 0);
  }
  return pedersenCompressInputs(wasm as BarretenbergWasm, [
    cd.contractAddress.toBuffer(),
    cd.portalContractAddress.toBuffer32(),
    cd.functionTreeRoot.toBuffer(),
  ]);
}
