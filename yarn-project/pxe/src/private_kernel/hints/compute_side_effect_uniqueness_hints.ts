import {
  GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET,
  GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET,
  GLOBAL_INDEX_NOTE_HASH_OFFSET,
  GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET,
  GLOBAL_INDEX_NULLIFIER_OFFSET,
  GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET,
  GLOBAL_INDEX_PRIVATE_CALL_REQUEST_OFFSET,
  GLOBAL_INDEX_PRIVATE_LOG_OFFSET,
  GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET,
  MAX_CONTRACT_CLASS_LOGS_PER_CALL,
  MAX_ENQUEUED_CALLS_PER_CALL,
  MAX_L2_TO_L1_MSGS_PER_CALL,
  MAX_NOTE_HASHES_PER_CALL,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIERS_PER_CALL,
  MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
  MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
  MAX_PRIVATE_LOGS_PER_CALL,
  TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import type { Serializable } from '@aztec/foundation/serialize';
import {
  ClaimedLengthArray,
  PrivateCallRequest,
  type PrivateCircuitPublicInputs,
  SideEffectCounterRange,
  SideEffectUniquenessHints,
} from '@aztec/stdlib/kernel';

export function computeSideEffectUniquenessHints(publicInputs: PrivateCircuitPublicInputs): SideEffectUniquenessHints {
  let sideEffectRanges: SideEffectCounterRange[] = [];

  sideEffectRanges = sideEffectRanges.concat(
    createRangesFromClaimedLengthArray(
      publicInputs.noteHashReadRequests,
      GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET,
      createRangeFromCountedItem,
    ),
  );
  sideEffectRanges = sideEffectRanges.concat(
    createRangesFromClaimedLengthArray(
      publicInputs.nullifierReadRequests,
      GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET,
      createRangeFromCountedItem,
    ),
  );
  sideEffectRanges = sideEffectRanges.concat(
    createRangesFromClaimedLengthArray(
      publicInputs.noteHashes,
      GLOBAL_INDEX_NOTE_HASH_OFFSET,
      createRangeFromCountedItem,
    ),
  );
  sideEffectRanges = sideEffectRanges.concat(
    createRangesFromClaimedLengthArray(
      publicInputs.nullifiers,
      GLOBAL_INDEX_NULLIFIER_OFFSET,
      createRangeFromCountedItem,
    ),
  );
  sideEffectRanges = sideEffectRanges.concat(
    createRangesFromClaimedLengthArray(
      publicInputs.privateCallRequests,
      GLOBAL_INDEX_PRIVATE_CALL_REQUEST_OFFSET,
      createRangeFromPrivateCallRequest,
    ),
  );
  sideEffectRanges = sideEffectRanges.concat(
    createRangesFromClaimedLengthArray(
      publicInputs.publicCallRequests,
      GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET,
      createRangeFromCountedItem,
    ),
  );
  sideEffectRanges = sideEffectRanges.concat(
    createRangesFromClaimedLengthArray(
      publicInputs.l2ToL1Msgs,
      GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET,
      createRangeFromCountedItem,
    ),
  );
  sideEffectRanges = sideEffectRanges.concat(
    createRangesFromClaimedLengthArray(
      publicInputs.privateLogs,
      GLOBAL_INDEX_PRIVATE_LOG_OFFSET,
      createRangeFromCountedItem,
    ),
  );
  sideEffectRanges = sideEffectRanges.concat(
    createRangesFromClaimedLengthArray(
      publicInputs.contractClassLogsHashes,
      GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET,
      createRangeFromCountedItem,
    ),
  );

  sideEffectRanges.sort((a, b) => a.start - b.start);

  const sideEffectRangeIndices = makeTuple(TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL, () => 0);
  for (let i = 0; i < sideEffectRanges.length; i++) {
    const range = sideEffectRanges[i];
    sideEffectRangeIndices[range.sideEffectGlobalIndex] = i;
  }

  const hints = SideEffectUniquenessHints.from({
    sideEffectRanges: padArrayEnd(
      sideEffectRanges,
      SideEffectCounterRange.empty(),
      TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL,
    ),
    noteHashReadRequestIndices: makeTuple(
      MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
      i => sideEffectRangeIndices[i + GLOBAL_INDEX_NOTE_HASH_READ_REQUEST_OFFSET],
    ),
    nullifierReadRequestIndices: makeTuple(
      MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
      i => sideEffectRangeIndices[i + GLOBAL_INDEX_NULLIFIER_READ_REQUEST_OFFSET],
    ),
    noteHashesIndices: makeTuple(
      MAX_NOTE_HASHES_PER_CALL,
      i => sideEffectRangeIndices[i + GLOBAL_INDEX_NOTE_HASH_OFFSET],
    ),
    nullifiersIndices: makeTuple(
      MAX_NULLIFIERS_PER_CALL,
      i => sideEffectRangeIndices[i + GLOBAL_INDEX_NULLIFIER_OFFSET],
    ),
    privateCallRequestsIndices: makeTuple(
      MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
      i => sideEffectRangeIndices[i + GLOBAL_INDEX_PRIVATE_CALL_REQUEST_OFFSET],
    ),
    publicCallRequestsIndices: makeTuple(
      MAX_ENQUEUED_CALLS_PER_CALL,
      i => sideEffectRangeIndices[i + GLOBAL_INDEX_PUBLIC_CALL_REQUEST_OFFSET],
    ),
    l2ToL1MsgsIndices: makeTuple(
      MAX_L2_TO_L1_MSGS_PER_CALL,
      i => sideEffectRangeIndices[i + GLOBAL_INDEX_L2_TO_L1_MSG_OFFSET],
    ),
    privateLogsIndices: makeTuple(
      MAX_PRIVATE_LOGS_PER_CALL,
      i => sideEffectRangeIndices[i + GLOBAL_INDEX_PRIVATE_LOG_OFFSET],
    ),
    contractClassLogsHashesIndices: makeTuple(
      MAX_CONTRACT_CLASS_LOGS_PER_CALL,
      i => sideEffectRangeIndices[i + GLOBAL_INDEX_CONTRACT_CLASS_LOG_HASH_OFFSET],
    ),
  });

  return hints;
}

function createRangesFromClaimedLengthArray<T extends Serializable, N extends number>(
  array: ClaimedLengthArray<T, N>,
  globalIndexOffset: number,
  rangeConstructor: (item: T, globalIndex: number) => SideEffectCounterRange,
): SideEffectCounterRange[] {
  const ranges = [];
  for (let i = 0; i < array.claimedLength; i++) {
    ranges.push(rangeConstructor(array.array[i], globalIndexOffset + i));
  }
  return ranges;
}

function createRangeFromCountedItem(item: { counter: number }, globalIndex: number): SideEffectCounterRange {
  return new SideEffectCounterRange(item.counter, item.counter, globalIndex);
}

function createRangeFromPrivateCallRequest(item: PrivateCallRequest, globalIndex: number): SideEffectCounterRange {
  return new SideEffectCounterRange(item.startSideEffectCounter, item.endSideEffectCounter, globalIndex);
}
