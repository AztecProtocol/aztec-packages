import { MAX_NOTE_HASHES_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Tuple } from '@aztec/foundation/serialize';

import { AztecAddress } from '../../aztec-address/index.js';
import { ClaimedLengthArray } from '../claimed_length_array.js';
import { NoteHash } from '../note_hash.js';
import { buildNoteHashReadRequestHints } from './build_note_hash_read_request_hints.js';
import { type NoteHashReadRequestHints, NoteHashReadRequestHintsBuilder } from './note_hash_read_request_hints.js';
import { ReadRequest, ScopedReadRequest } from './read_request.js';
import { PendingReadHint, ReadRequestAction, SettledReadHint } from './read_request_hints.js';

describe('buildNoteHashReadRequestHints', () => {
  const contractAddress = AztecAddress.fromBigIntUnsafe(112233n);

  const getNoteHashValue = (index: number) => index + 9999;

  const makePendingReadRequest = (value: number, counter = 2) =>
    new ReadRequest(new Fr(value), counter).scope(contractAddress);

  const makeSettledReadRequest = (value: number, counter = 2) =>
    new ReadRequest(new Fr(value), counter).scope(AztecAddress.ZERO);

  const makeNoteHash = (value: number, counter = 1) => new NoteHash(new Fr(value), counter).scope(contractAddress);
  /**
   * Create fixtures.
   */
  const noteHashes = makeTuple(MAX_NOTE_HASHES_PER_TX, i => makeNoteHash(getNoteHashValue(i)));
  const futureNoteHashes = Array.from({ length: MAX_NOTE_HASHES_PER_TX }).map((_, i) =>
    makeNoteHash(getNoteHashValue(i + MAX_NOTE_HASHES_PER_TX)),
  );

  const settledNoteHashes = [111, 222, 333];
  const oracle = {
    getNoteHashMembershipWitness: (noteHash: Fr) =>
      settledNoteHashes.includes(noteHash.toNumber()) ? ({} as any) : undefined,
  };

  /**
   * Create initial state.
   */
  let noteHashReadRequests: Tuple<ScopedReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>;
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
    noteHashReadRequests[readRequestIndex] = makePendingReadRequest(getNoteHashValue(noteHashIndex));
    expectedHints.readRequestActions[readRequestIndex] = ReadRequestAction.readAsPending(hintIndex);
    expectedHints.pendingReadHints[hintIndex] = new PendingReadHint(readRequestIndex, noteHashIndex);
    numReadRequests++;
    numPendingReads++;
  };

  const readSettledNoteHash = (noteHashIndex: number) => {
    const readRequestIndex = numReadRequests;
    const hintIndex = numSettledReads;
    const value = settledNoteHashes[noteHashIndex];
    noteHashReadRequests[readRequestIndex] = makeSettledReadRequest(settledNoteHashes[noteHashIndex]);
    expectedHints.readRequestActions[readRequestIndex] = ReadRequestAction.readAsSettled(hintIndex);
    expectedHints.settledReadHints[hintIndex] = new SettledReadHint(readRequestIndex, {} as any, new Fr(value));
    numReadRequests++;
    numSettledReads++;
  };

  const readFutureNoteHash = (noteHashIndex: number) => {
    const readRequestIndex = numReadRequests;
    noteHashReadRequests[readRequestIndex] = makePendingReadRequest(futureNoteHashes[noteHashIndex].value.toNumber());
    numReadRequests++;
  };

  const buildHints = async () =>
    await buildNoteHashReadRequestHints(
      oracle,
      new ClaimedLengthArray(noteHashReadRequests, numReadRequests),
      new ClaimedLengthArray(noteHashes, MAX_NOTE_HASHES_PER_TX),
    );

  beforeEach(() => {
    noteHashReadRequests = makeTuple(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, ScopedReadRequest.empty);
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
    readPendingNoteHash(BlockNumber(1));
    const hints = await buildHints();
    expect(hints).toEqual(expectedHints);
  });

  it('builds hints for settled note hash read requests', async () => {
    readSettledNoteHash(0);
    readSettledNoteHash(BlockNumber(1));
    const hints = await buildHints();
    expect(hints).toEqual(expectedHints);
  });

  it('builds hints for mixed pending, settled and future note hash read requests', async () => {
    readPendingNoteHash(2);
    readSettledNoteHash(2);
    readSettledNoteHash(0);
    readFutureNoteHash(0);
    readPendingNoteHash(BlockNumber(1));
    readFutureNoteHash(BlockNumber(1));
    readPendingNoteHash(BlockNumber(1));
    readSettledNoteHash(2);
    const hints = await buildHints();
    expect(hints).toEqual(expectedHints);
  });

  it('throws if settled read request cannot find a match in the tree', async () => {
    // A settled read request for a value that the oracle can't find.
    noteHashReadRequests[0] = makeSettledReadRequest(456);
    numReadRequests = 1;
    await expect(() => buildHints()).rejects.toThrow('Read request is reading an unknown note hash.');
  });
});
