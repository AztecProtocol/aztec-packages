import { MAX_NOTE_HASHES_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';

import { AztecAddress } from '../../aztec-address/index.js';
import { ClaimedLengthArray } from '../claimed_length_array.js';
import { NoteHash } from '../note_hash.js';
import { buildNoteHashReadRequestHints } from './build_note_hash_read_request_hints.js';
import { type NoteHashReadRequestHints, NoteHashReadRequestHintsBuilder } from './note_hash_read_request_hints.js';
import { ReadRequest, ScopedReadRequest } from './read_request.js';
import { PendingReadHint, ReadRequestAction, SettledReadHint } from './read_request_hints.js';

describe('buildNoteHashReadRequestHints', () => {
  const contractAddress = AztecAddress.fromBigInt(112233n);

  const getNoteHashValue = (index: number) => index + 9999;

  const makeReadRequest = (value: number, counter = 2) =>
    new ReadRequest(new Fr(value), counter).scope(contractAddress);

  const makeNoteHash = (value: number, counter = 1) => new NoteHash(new Fr(value), counter).scope(contractAddress);
  /**
   * Create fixtures.
   */
  const noteHashes = makeTuple(MAX_NOTE_HASHES_PER_TX, i => makeNoteHash(getNoteHashValue(i)));
  const futureNoteHashes = Array.from({ length: MAX_NOTE_HASHES_PER_TX }).map((_, i) =>
    makeNoteHash(getNoteHashValue(i + MAX_NOTE_HASHES_PER_TX)),
  );

  const settledNoteHashes = [111, 222, 333];
  const settledLeafIndexes = [1010n, 2020n, 3030n];
  const oracle = {
    getNoteHashMembershipWitness: (leafIndex: bigint) =>
      settledLeafIndexes.includes(leafIndex) ? ({} as any) : undefined,
  };

  /**
   * Create initial state.
   */
  let noteHashReadRequests: Tuple<ScopedReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>;
  let noteHashLeafIndexMap: Map<bigint, bigint> = new Map();
  let expectedHints: NoteHashReadRequestHints<
    typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
    typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX
  >;
  let numReadRequests = 0;
  let numPendingReads = 0;
  let numSettledReads = 0;

  /**
   * Helper functions for updating the state.
   */
  const readPendingNoteHash = (noteHashIndex: number) => {
    const readRequestIndex = numReadRequests;
    const hintIndex = numPendingReads;
    noteHashReadRequests[readRequestIndex] = makeReadRequest(getNoteHashValue(noteHashIndex));
    expectedHints.readRequestActions[readRequestIndex] = ReadRequestAction.readAsPending(hintIndex);
    expectedHints.pendingReadHints[hintIndex] = new PendingReadHint(readRequestIndex, noteHashIndex);
    numReadRequests++;
    numPendingReads++;
  };

  const readSettledNoteHash = (noteHashIndex: number) => {
    const readRequestIndex = numReadRequests;
    const hintIndex = numSettledReads;
    const value = settledNoteHashes[noteHashIndex];
    noteHashLeafIndexMap.set(BigInt(value), settledLeafIndexes[noteHashIndex]);
    noteHashReadRequests[readRequestIndex] = makeReadRequest(settledNoteHashes[noteHashIndex]);
    expectedHints.readRequestActions[readRequestIndex] = ReadRequestAction.readAsSettled(hintIndex);
    expectedHints.settledReadHints[hintIndex] = new SettledReadHint(readRequestIndex, {} as any, new Fr(value));
    numReadRequests++;
    numSettledReads++;
  };

  const readFutureNoteHash = (noteHashIndex: number) => {
    const readRequestIndex = numReadRequests;
    noteHashReadRequests[readRequestIndex] = makeReadRequest(futureNoteHashes[noteHashIndex].value.toNumber());
    numReadRequests++;
  };

  const buildHints = async () =>
    await buildNoteHashReadRequestHints(
      oracle,
      new ClaimedLengthArray(noteHashReadRequests, numReadRequests),
      new ClaimedLengthArray(noteHashes, MAX_NOTE_HASHES_PER_TX),
      noteHashLeafIndexMap,
      futureNoteHashes,
    );

  beforeEach(() => {
    noteHashReadRequests = makeTuple(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, ScopedReadRequest.empty);
    noteHashLeafIndexMap = new Map();
    expectedHints = NoteHashReadRequestHintsBuilder.empty(
      MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
      MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
    );
    numReadRequests = 0;
    numPendingReads = 0;
    numSettledReads = 0;
  });

  it('builds empty hints', async () => {
    const hints = await buildHints();
    expect(hints).toEqual(expectedHints);
  });

  it('builds hints for pending note hash read requests', async () => {
    readPendingNoteHash(2);
    readPendingNoteHash(1);
    const hints = await buildHints();
    expect(hints).toEqual(expectedHints);
  });

  it('builds hints for settled note hash read requests', async () => {
    readSettledNoteHash(0);
    readSettledNoteHash(1);
    const hints = await buildHints();
    expect(hints).toEqual(expectedHints);
  });

  it('builds hints for mixed pending, settled and future note hash read requests', async () => {
    readPendingNoteHash(2);
    readSettledNoteHash(2);
    readSettledNoteHash(0);
    readFutureNoteHash(0);
    readPendingNoteHash(1);
    readFutureNoteHash(1);
    readPendingNoteHash(1);
    readSettledNoteHash(2);
    const hints = await buildHints();
    expect(hints).toEqual(expectedHints);
  });

  it('throws if cannot find a match in pending set and in the tree', async () => {
    readPendingNoteHash(2);
    // Tweak the value of the read request.
    noteHashReadRequests[0].readRequest.value = new Fr(123);
    await expect(() => buildHints()).rejects.toThrow('Read request is reading an unknown note hash.');
  });
});
