import {
  type MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  type NOTE_HASH_TREE_HEIGHT,
} from '@aztec/constants';
import type { MembershipWitness } from '@aztec/foundation/trees';

import type { ClaimedLengthArray } from '../claimed_length_array.js';
import type { ScopedNoteHash } from '../note_hash.js';
import { NoteHashReadRequestHintsBuilder } from './note_hash_read_request_hints.js';
import type { ScopedReadRequest } from './read_request.js';
import { PendingReadHint, ReadRequestActionEnum, ReadRequestResetActions } from './read_request_hints.js';
import { ScopedValueCache } from './scoped_value_cache.js';

export function isValidNoteHashReadRequest(readRequest: ScopedReadRequest, noteHash: ScopedNoteHash) {
  return (
    noteHash.value.equals(readRequest.value) &&
    noteHash.contractAddress.equals(readRequest.contractAddress) &&
    readRequest.counter > noteHash.counter
  );
}

export function getNoteHashReadRequestResetActions(
  noteHashReadRequests: ClaimedLengthArray<ScopedReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
  noteHashes: ClaimedLengthArray<ScopedNoteHash, typeof MAX_NOTE_HASHES_PER_TX>,
  futureNoteHashes: ScopedNoteHash[],
): ReadRequestResetActions<typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX> {
  const resetActions = ReadRequestResetActions.empty(MAX_NOTE_HASH_READ_REQUESTS_PER_TX);

  const noteHashMap: Map<bigint, { noteHash: ScopedNoteHash; index: number }[]> = new Map();
  noteHashes.getActiveItems().forEach((noteHash, index) => {
    const value = noteHash.value.toBigInt();
    const arr = noteHashMap.get(value) ?? [];
    arr.push({ noteHash, index });
    noteHashMap.set(value, arr);
  });

  const futureNoteHashMap = new ScopedValueCache(futureNoteHashes);

  for (let i = 0; i < noteHashReadRequests.claimedLength; ++i) {
    const readRequest = noteHashReadRequests.array[i];

    const pendingNoteHash = noteHashMap
      .get(readRequest.value.toBigInt())
      ?.find(n => isValidNoteHashReadRequest(readRequest, n.noteHash));

    if (pendingNoteHash !== undefined) {
      resetActions.actions[i] = ReadRequestActionEnum.READ_AS_PENDING;
      resetActions.pendingReadHints.push(new PendingReadHint(i, pendingNoteHash.index));
    } else if (
      !futureNoteHashMap
        .get(readRequest)
        .find(futureNoteHash => isValidNoteHashReadRequest(readRequest, futureNoteHash))
    ) {
      resetActions.actions[i] = ReadRequestActionEnum.READ_AS_SETTLED;
    }
  }

  return resetActions;
}

export async function buildNoteHashReadRequestHintsFromResetActions<PENDING extends number, SETTLED extends number>(
  oracle: {
    getNoteHashMembershipWitness(leafIndex: bigint): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>>;
  },
  noteHashReadRequests: ClaimedLengthArray<ScopedReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
  noteHashes: ClaimedLengthArray<ScopedNoteHash, typeof MAX_NOTE_HASHES_PER_TX>,
  resetActions: ReadRequestResetActions<typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
  noteHashLeafIndexMap: Map<bigint, bigint>,
  maxPending: PENDING = MAX_NOTE_HASH_READ_REQUESTS_PER_TX as PENDING,
  maxSettled: SETTLED = MAX_NOTE_HASH_READ_REQUESTS_PER_TX as SETTLED,
) {
  const builder = new NoteHashReadRequestHintsBuilder(maxPending, maxSettled);

  resetActions.pendingReadHints.forEach(hint => {
    builder.addPendingReadRequest(hint.readRequestIndex, hint.pendingValueIndex);
  });

  for (let i = 0; i < resetActions.actions.length; i++) {
    if (resetActions.actions[i] === ReadRequestActionEnum.READ_AS_SETTLED) {
      const readRequest = noteHashReadRequests.array[i];
      const leafIndex = noteHashLeafIndexMap.get(readRequest.value.toBigInt());
      if (leafIndex === undefined) {
        throw new Error('Read request is reading an unknown note hash.');
      }
      const membershipWitness = await oracle.getNoteHashMembershipWitness(leafIndex);
      builder.addSettledReadRequest(i, membershipWitness, readRequest.value);
    }
  }

  const noteHashMap: Map<bigint, { noteHash: ScopedNoteHash; index: number }[]> = new Map();
  noteHashes.getActiveItems().forEach((noteHash, index) => {
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
  noteHashReadRequests: ClaimedLengthArray<ScopedReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
  noteHashes: ClaimedLengthArray<ScopedNoteHash, typeof MAX_NOTE_HASHES_PER_TX>,
  noteHashLeafIndexMap: Map<bigint, bigint>,
  futureNoteHashes: ScopedNoteHash[],
  maxPending: PENDING = MAX_NOTE_HASH_READ_REQUESTS_PER_TX as PENDING,
  maxSettled: SETTLED = MAX_NOTE_HASH_READ_REQUESTS_PER_TX as SETTLED,
) {
  const resetActions = getNoteHashReadRequestResetActions(noteHashReadRequests, noteHashes, futureNoteHashes);
  return await buildNoteHashReadRequestHintsFromResetActions(
    oracle,
    noteHashReadRequests,
    noteHashes,
    resetActions,
    noteHashLeafIndexMap,
    maxPending,
    maxSettled,
  );
}
