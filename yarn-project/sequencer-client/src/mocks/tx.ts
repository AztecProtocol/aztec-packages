<<<<<<< HEAD
import { PrivateKernelPublicInputs, Proof } from '@aztec/circuits.js';
import { makePrivateKernelPublicInputs } from '@aztec/circuits.js/factories';
import { PrivateTx, Tx, UnverifiedData } from '@aztec/types';
=======
import { KernelCircuitPublicInputs, UInt8Vector } from '@aztec/circuits.js';
import { makeKernelPublicInputs, makeSignedTxRequest } from '@aztec/circuits.js/factories';
import { PrivateTx, PublicTx, Tx, UnverifiedData } from '@aztec/types';
>>>>>>> origin/master

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
