import { type Tx } from '@aztec/circuit-types';

/**
 * Looks at the side effects of a transaction and returns the highest counter
 * @param tx - A transaction
 * @returns The highest side effect counter in the transaction so far
 */
export function lastSideEffectCounter(tx: Tx): number {
  const data = tx.data.forPublic!;
  const sideEffectCounters = [
    ...data.endNonRevertibleData.newNoteHashes,
    ...data.endNonRevertibleData.newNullifiers,
    ...data.endNonRevertibleData.unencryptedLogsHashes,
    ...data.endNonRevertibleData.publicCallStack,
    ...data.endNonRevertibleData.publicDataUpdateRequests,
    ...data.end.newNoteHashes,
    ...data.end.newNullifiers,
    ...data.end.unencryptedLogsHashes,
    ...data.end.publicCallStack,
    ...data.end.publicDataUpdateRequests,
  ];

  let max = 0;
  for (const sideEffect of sideEffectCounters) {
    if ('startSideEffectCounter' in sideEffect) {
      // look at both start and end counters because for enqueued public calls start > 0 while end === 0
      max = Math.max(max, sideEffect.startSideEffectCounter.toNumber(), sideEffect.endSideEffectCounter.toNumber());
    } else if ('counter' in sideEffect) {
      max = Math.max(max, sideEffect.counter);
    } else {
      throw new Error('Unknown side effect type');
    }
  }

  return max;
}
