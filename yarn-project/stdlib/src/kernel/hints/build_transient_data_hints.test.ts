import { Fr } from '@aztec/foundation/curves/bn254';

import { AztecAddress } from '../../aztec-address/index.js';
import { ClaimedLengthArray } from '../claimed_length_array.js';
import { NoteHash, type ScopedNoteHash } from '../note_hash.js';
import { Nullifier, type ScopedNullifier } from '../nullifier.js';
import { PrivateLogData, ScopedPrivateLogData } from '../private_log_data.js';
import { buildTransientDataHints, countSquashedLogs } from './build_transient_data_hints.js';
import { ReadRequest, ScopedReadRequest } from './read_request.js';
import { TransientDataSquashingHint } from './transient_data_squashing_hint.js';

describe('buildTransientDataHints', () => {
  const contractAddress = AztecAddress.fromBigIntUnsafe(987654n);

  let noteHashes: ScopedNoteHash[];
  let nullifiers: ScopedNullifier[];
  let nadaIndexHint: TransientDataSquashingHint;
  let futureNoteHashReads: ScopedReadRequest[];
  let futureNullifierReads: ScopedReadRequest[];
  let futureLogs: PrivateLogData[];
  let noteHashNullifierCounterMap: Map<number, number>;
  let validationRequestsSplitCounter = 0;

  const buildHints = () =>
    buildTransientDataHints(
      new ClaimedLengthArray(noteHashes, noteHashes.length),
      new ClaimedLengthArray(nullifiers, nullifiers.length),
      futureNoteHashReads,
      futureNullifierReads,
      futureLogs,
      noteHashNullifierCounterMap,
      validationRequestsSplitCounter,
    );

  beforeEach(() => {
    validationRequestsSplitCounter = 0;
    futureLogs = [];
    noteHashes = [
      new NoteHash(new Fr(11), 100).scope(contractAddress),
      new NoteHash(new Fr(22), 200).scope(contractAddress),
      new NoteHash(new Fr(33), 300).scope(contractAddress),
      new NoteHash(new Fr(44), 350).scope(contractAddress),
      new NoteHash(new Fr(50), 375).scope(contractAddress),
    ];
    nullifiers = [
      new Nullifier(new Fr(55), new Fr(0), 400).scope(contractAddress),
      new Nullifier(new Fr(66), new Fr(33), 500).scope(contractAddress),
      new Nullifier(new Fr(77), new Fr(44), 600).scope(contractAddress),
      new Nullifier(new Fr(88), new Fr(11), 700).scope(contractAddress),
    ];
    nadaIndexHint = new TransientDataSquashingHint(nullifiers.length, noteHashes.length);
    futureNoteHashReads = [new ScopedReadRequest(new ReadRequest(new Fr(44), 351), contractAddress)];
    futureNullifierReads = [new ScopedReadRequest(new ReadRequest(new Fr(66), 502), contractAddress)];
    noteHashNullifierCounterMap = new Map();
    noteHashNullifierCounterMap.set(100, 700);
    noteHashNullifierCounterMap.set(300, 500);
    noteHashNullifierCounterMap.set(350, 600);
    noteHashNullifierCounterMap.set(375, 800);
    /**
     * nullifiers[0] not nullifying any note hashes.
     * nullifiers[1] <> noteHashes[2], nullifier is read.
     * nullifiers[2] <> noteHashes[3], note hash is read.
     * nullifiers[3] <> noteHashes[0].
     * noteHashes[1] and noteHashes[4] not being nullified.
     */
  });

  it('builds index hints that link transient note hashes and nullifiers', () => {
    const { numTransientData, hints } = buildHints();
    // Only first one is squashed, since:
    // second one is not linked to a nullifier
    // third one's nullifier will be read
    // and fourth note hash will be read.
    expect(numTransientData).toBe(1);
    expect(hints).toEqual([new TransientDataSquashingHint(3, 0), nadaIndexHint, nadaIndexHint, nadaIndexHint]);
  });

  it('keeps the pair if note hash does not match', () => {
    nullifiers[3].nullifier.noteHash = new Fr(9999);
    const { numTransientData, hints } = buildHints();
    expect(numTransientData).toBe(0);
    expect(hints).toEqual(Array(nullifiers.length).fill(nadaIndexHint));
  });

  it('keeps the pair if note hash is non-revertible and nullifier is revertible', () => {
    validationRequestsSplitCounter = noteHashes[0].counter + 1;
    const { numTransientData, hints } = buildHints();
    expect(numTransientData).toBe(0);
    expect(hints).toEqual(Array(nullifiers.length).fill(nadaIndexHint));
  });

  it('throws if contract address does not match', () => {
    nullifiers[3].contractAddress = AztecAddress.fromBigIntUnsafe(123456n);
    expect(buildHints).toThrow('Contract address of hinted note hash does not match.');
  });

  it('throws if note hash counter is larger than nullifier counter', () => {
    nullifiers[3].nullifier.counter = noteHashes[0].counter - 1;
    noteHashNullifierCounterMap.set(noteHashes[0].counter, noteHashes[0].counter - 1);
    expect(buildHints).toThrow('Hinted nullifier has smaller counter than note hash.');
  });

  it('keeps the pair if a future log is linked to the note hash', () => {
    // noteHashes[0] (counter 100) <> nullifiers[3] would normally be squashed.
    // Add a future log linked to noteHashes[0].
    const log = PrivateLogData.empty();
    log.noteHashCounter = 100;
    futureLogs = [log];
    const { numTransientData, hints } = buildHints();
    expect(numTransientData).toBe(0);
    expect(hints).toEqual(Array(nullifiers.length).fill(nadaIndexHint));
  });

  it('squashes the pair if future log is linked to a different note hash', () => {
    // Future log linked to noteHashes[1] (counter 200), not noteHashes[0] (counter 100).
    const log = PrivateLogData.empty();
    log.noteHashCounter = 200;
    futureLogs = [log];
    const { numTransientData, hints } = buildHints();
    // noteHashes[0] <> nullifiers[3] should still be squashed.
    expect(numTransientData).toBe(1);
    expect(hints).toEqual([new TransientDataSquashingHint(3, 0), nadaIndexHint, nadaIndexHint, nadaIndexHint]);
  });

  it('ignores future logs with noteHashCounter of 0', () => {
    // A log with noteHashCounter = 0 is not linked to any note hash.
    const log = PrivateLogData.empty();
    log.noteHashCounter = 0;
    futureLogs = [log];
    const { numTransientData, hints } = buildHints();
    expect(numTransientData).toBe(1);
    expect(hints).toEqual([new TransientDataSquashingHint(3, 0), nadaIndexHint, nadaIndexHint, nadaIndexHint]);
  });
});

describe('countSquashedLogs', () => {
  const contractAddress = AztecAddress.fromBigIntUnsafe(987654n);

  const makeLog = (noteHashCounter: number, counter: number): ScopedPrivateLogData => {
    const log = PrivateLogData.empty();
    log.noteHashCounter = noteHashCounter;
    log.counter = counter;
    return new ScopedPrivateLogData(log, contractAddress);
  };

  it('returns 0 when no hints are provided', () => {
    const noteHashes: ScopedNoteHash[] = [new NoteHash(new Fr(11), 100).scope(contractAddress)];
    const logs: ScopedPrivateLogData[] = [makeLog(100, 101)];

    const result = countSquashedLogs(
      new ClaimedLengthArray(noteHashes, noteHashes.length),
      new ClaimedLengthArray(logs, logs.length),
      [],
    );
    expect(result).toBe(0);
  });

  it('returns 0 when no logs are linked to squashed note hashes', () => {
    const noteHashes: ScopedNoteHash[] = [
      new NoteHash(new Fr(11), 100).scope(contractAddress),
      new NoteHash(new Fr(22), 200).scope(contractAddress),
    ];
    const logs: ScopedPrivateLogData[] = [makeLog(0, 300), makeLog(0, 400)];
    const hints = [new TransientDataSquashingHint(0, 0)];

    const result = countSquashedLogs(
      new ClaimedLengthArray(noteHashes, noteHashes.length),
      new ClaimedLengthArray(logs, logs.length),
      hints,
    );
    expect(result).toBe(0);
  });

  it('counts logs linked to squashed note hashes', () => {
    const noteHashes: ScopedNoteHash[] = [
      new NoteHash(new Fr(11), 100).scope(contractAddress),
      new NoteHash(new Fr(22), 200).scope(contractAddress),
    ];
    // Two logs linked to noteHashes[0] (counter 100), one unlinked.
    const logs: ScopedPrivateLogData[] = [makeLog(100, 101), makeLog(100, 102), makeLog(0, 300)];
    // Hint squashes noteHashes[0].
    const hints = [new TransientDataSquashingHint(0, 0)];

    const result = countSquashedLogs(
      new ClaimedLengthArray(noteHashes, noteHashes.length),
      new ClaimedLengthArray(logs, logs.length),
      hints,
    );
    expect(result).toBe(2);
  });
});
