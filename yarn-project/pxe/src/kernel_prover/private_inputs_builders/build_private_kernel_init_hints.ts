import {
  type CallRequest,
  type MAX_NEW_NOTE_HASHES_PER_CALL,
  type PrivateCircuitPublicInputs,
  PrivateKernelInitHints,
} from '@aztec/circuits.js';
import { type Tuple } from '@aztec/foundation/serialize';

export function buildPrivateKernelInitHints(
  publicInputs: PrivateCircuitPublicInputs,
  noteHashNullifierCounterMap: Map<number, number>,
  privateCallRequests: CallRequest[],
  publicCallRequests: CallRequest[],
) {
  const nullifierCounters = publicInputs.newNoteHashes.map(
    n => noteHashNullifierCounterMap.get(n.counter) ?? 0,
  ) as Tuple<number, typeof MAX_NEW_NOTE_HASHES_PER_CALL>;

  const minRevertibleCounter = publicInputs.minRevertibleSideEffectCounter;
  const firstRevertiblePrivateCallRequestIndex = privateCallRequests.findIndex(
    r => r.startSideEffectCounter > minRevertibleCounter,
  );
  const firstRevertiblePublicCallRequestIndex = publicCallRequests.findIndex(
    r => r.startSideEffectCounter > minRevertibleCounter,
  );

  return new PrivateKernelInitHints(
    nullifierCounters,
    firstRevertiblePrivateCallRequestIndex,
    firstRevertiblePublicCallRequestIndex,
  );
}
