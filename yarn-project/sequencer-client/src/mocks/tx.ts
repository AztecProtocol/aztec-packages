import { Proof, KernelCircuitPublicInputs } from '@aztec/circuits.js';
import { makeKernelPublicInputs, makeSignedTxRequest } from '@aztec/circuits.js/factories';
import { UnverifiedData, PrivateTx, Tx, PublicTx } from '@aztec/types';

function makeEmptyProof() {
  return new Proof(Buffer.alloc(0));
}

export function makeEmptyUnverifiedData(): UnverifiedData {
  const chunks = [Buffer.alloc(0)];
  return new UnverifiedData(chunks);
}

export function makeEmptyPrivateTx(): PrivateTx {
  return Tx.createPrivate(KernelCircuitPublicInputs.empty(), makeEmptyProof(), makeEmptyUnverifiedData());
}

export function makePrivateTx(seed = 0): PrivateTx {
  return Tx.createPrivate(makeKernelPublicInputs(seed), makeEmptyProof(), UnverifiedData.random(2));
}

export function makePublicTx(seed = 0): PublicTx {
  return Tx.createPublic(makeSignedTxRequest(seed));
}
