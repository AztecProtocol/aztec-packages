import { UInt8Vector } from '@aztec/circuits.js';
import { Tx } from '@aztec/p2p';

function makeEmptyProof() {
  return new UInt8Vector(Buffer.alloc(0));
}

function makeEmptyPrivateKernelPublicInputs() {
  // TODO: Implement me
  return {} as any;
}

export function makeEmptyTx(): Tx {
  return new Tx(makeEmptyPrivateKernelPublicInputs(), makeEmptyProof());
}
