import { KernelCircuitPublicInputs, KERNEL_PUBLIC_CALL_STACK_LENGTH, makeEmptyProof } from '@aztec/circuits.js';
import { makeKernelPublicInputs, makePublicCallRequest, makeSignedTxRequest } from '@aztec/circuits.js/factories';
import { EventLogs, PrivateTx, Tx, PublicTx } from '@aztec/types';
import times from 'lodash.times';

/**
 * Testing utility to create empty unverified data composed by a single empty chunk.
 */
export function makeEmptyUnverifiedData(): EventLogs {
  const chunks = [Buffer.alloc(0)];
  return new EventLogs(chunks);
}

/**
 * Testing utility to create a tx with an empty kernel circuit output, empty proof, and empty unverified data.
 */
export function makeEmptyPrivateTx(): PrivateTx {
  return Tx.createPrivate(KernelCircuitPublicInputs.empty(), makeEmptyProof(), makeEmptyUnverifiedData(), [], []);
}

/**
 * Testing utility to create a tx with gibberish kernel circuit output, random unverified data, and an empty proof.
 */
export function makePrivateTx(seed = 0): PrivateTx {
  return Tx.createPrivate(
    makeKernelPublicInputs(seed),
    makeEmptyProof(),
    EventLogs.random(2),
    [],
    times(KERNEL_PUBLIC_CALL_STACK_LENGTH, makePublicCallRequest),
  );
}

/**
 * Testing utility to create a tx with a request to execute a public function.
 */
export function makePublicTx(seed = 0): PublicTx {
  return Tx.createPublic(makeSignedTxRequest(seed));
}
