import { type Tuple } from '@aztec/foundation/serialize';

import {
  type MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  type NOTE_HASH_TREE_HEIGHT,
} from '../constants.gen.js';
import { siloNoteHash } from '../hash/index.js';
import {
  type MembershipWitness,
  NoteHashReadRequestHintsBuilder,
  PendingReadHint,
  ReadRequestResetStates,
  ReadRequestState,
  type ScopedNoteHash,
  type ScopedReadRequest,
} from '../structs/index.js';
import { countAccumulatedItems, getNonEmptyItems } from '../utils/index.js';
import { ScopedValueCache } from './scoped_value_cache.js';

export function isValidNoteHashReadRequest(readRequest: ScopedReadRequest, noteHash: ScopedNoteHash) {
  return (
    noteHash.value.equals(readRequest.value) &&
    noteHash.contractAddress.equals(readRequest.contractAddress) &&
    readRequest.counter > noteHash.counter
  );
}

export function getNoteHashReadRequestResetStates(
  noteHashReadRequests: Tuple<ScopedReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
  noteHashes: Tuple<ScopedNoteHash, typeof MAX_NOTE_HASHES_PER_TX>,
  futureNoteHashes: ScopedNoteHash[],
): ReadRequestResetStates<typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX> {
  const resetStates = ReadRequestResetStates.empty(MAX_NOTE_HASH_READ_REQUESTS_PER_TX);

  const noteHashMap: Map<bigint, { noteHash: ScopedNoteHash; index: number }[]> = new Map();
  getNonEmptyItems(noteHashes).forEach((noteHash, index) => {
    const value = noteHash.value.toBigInt();
    const arr = noteHashMap.get(value) ?? [];
    arr.push({ noteHash, index });
    noteHashMap.set(value, arr);
  });

  const futureNoteHashMap = new ScopedValueCache(futureNoteHashes);

  const numReadRequests = countAccumulatedItems(noteHashReadRequests);
  for (let i = 0; i < numReadRequests; ++i) {
    const readRequest = noteHashReadRequests[i];

    const pendingNoteHash = noteHashMap
      .get(readRequest.value.toBigInt())
      ?.find(n => isValidNoteHashReadRequest(readRequest, n.noteHash));

    if (pendingNoteHash !== undefined) {
      resetStates.states[i] = ReadRequestState.PENDING;
      resetStates.pendingReadHints.push(new PendingReadHint(i, pendingNoteHash.index));
    } else if (
      !futureNoteHashMap
        .get(readRequest)
        .find(futureNoteHash => isValidNoteHashReadRequest(readRequest, futureNoteHash))
    ) {
      resetStates.states[i] = ReadRequestState.SETTLED;
    }
  }

  return resetStates;
}

export async function buildNoteHashReadRequestHintsFromResetStates<PENDING extends number, SETTLED extends number>(
  oracle: {
    getNoteHashMembershipWitness(leafIndex: bigint): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>>;
  },
  noteHashReadRequests: Tuple<ScopedReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
  noteHashes: Tuple<ScopedNoteHash, typeof MAX_NOTE_HASHES_PER_TX>,
  resetStates: ReadRequestResetStates<typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
  noteHashLeafIndexMap: Map<bigint, bigint>,
  maxPending: PENDING = MAX_NOTE_HASH_READ_REQUESTS_PER_TX as PENDING,
  maxSettled: SETTLED = MAX_NOTE_HASH_READ_REQUESTS_PER_TX as SETTLED,
) {
  const builder = new NoteHashReadRequestHintsBuilder(maxPending, maxSettled);

  resetStates.pendingReadHints.forEach(hint => {
    builder.addPendingReadRequest(hint.readRequestIndex, hint.pendingValueIndex);
  });

  for (let i = 0; i < resetStates.states.length; i++) {
    if (resetStates.states[i] === ReadRequestState.SETTLED) {
      const readRequest = noteHashReadRequests[i];
      const siloedValue = siloNoteHash(readRequest.contractAddress, readRequest.value);
      const leafIndex = noteHashLeafIndexMap.get(siloedValue.toBigInt());
      if (leafIndex === undefined) {
        throw new Error('Read request is reading an unknown note hash.');
      }
      const membershipWitness = await oracle.getNoteHashMembershipWitness(leafIndex);
      builder.addSettledReadRequest(i, membershipWitness, siloedValue);
    }
  }

  const noteHashMap: Map<bigint, { noteHash: ScopedNoteHash; index: number }[]> = new Map();
  getNonEmptyItems(noteHashes).forEach((noteHash, index) => {
    const value = noteHash.value.toBigInt();
    const arr = noteHashMap.get(value) ?? [];
    arr.push({ noteHash, index });
    noteHashMap.set(value, arr);
  });

  return builder.toHints();
}

export async function buildNoteHashReadRequestHints<PENDING extends number, SETTLED extends number>(
  oracle: {
    getNoteHashMembershipWitness(leafIndex: bigint): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>>;
  },
  noteHashReadRequests: Tuple<ScopedReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
  noteHashes: Tuple<ScopedNoteHash, typeof MAX_NOTE_HASHES_PER_TX>,
  noteHashLeafIndexMap: Map<bigint, bigint>,
  futureNoteHashes: ScopedNoteHash[],
  maxPending: PENDING = MAX_NOTE_HASH_READ_REQUESTS_PER_TX as PENDING,
  maxSettled: SETTLED = MAX_NOTE_HASH_READ_REQUESTS_PER_TX as SETTLED,
) {
  const resetStates = getNoteHashReadRequestResetStates(noteHashReadRequests, noteHashes, futureNoteHashes);
  return await buildNoteHashReadRequestHintsFromResetStates(
    oracle,
    noteHashReadRequests,
    noteHashes,
    resetStates,
    noteHashLeafIndexMap,
    maxPending,
    maxSettled,
  );
}
