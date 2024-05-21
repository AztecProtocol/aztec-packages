import {
  type AztecAddress,
  type Fr,
  type NoteLogHash,
  type ScopedNoteHash,
  type ScopedNullifier,
  type ScopedReadRequest,
  countAccumulatedItems,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { type Tuple } from '@aztec/foundation/serialize';

function scopedValueId(scopedValue: { contractAddress: AztecAddress; value: Fr }): string {
  return `${scopedValue.contractAddress.toString()}:${scopedValue.value.toString()}`;
}

export function buildTransientDataHints<
  NOTE_HASHES_LEN extends number,
  NULLIFIERS_LEN extends number,
  LOGS_LEN extends number,
>(
  noteHashes: Tuple<ScopedNoteHash, NOTE_HASHES_LEN>,
  nullifiers: Tuple<ScopedNullifier, NULLIFIERS_LEN>,
  noteLogs: Tuple<NoteLogHash, LOGS_LEN>,
  futureNoteHashReads: ScopedReadRequest[],
  futureNullifierReads: ScopedReadRequest[],
  noteHashesLength: NOTE_HASHES_LEN = noteHashes.length as NOTE_HASHES_LEN,
  nullifiersLength: NULLIFIERS_LEN = nullifiers.length as NULLIFIERS_LEN,
  logsLength: LOGS_LEN = noteLogs.length as LOGS_LEN,
): [Tuple<number, NOTE_HASHES_LEN>, Tuple<number, NULLIFIERS_LEN>, Tuple<number, LOGS_LEN>] {
  const futureNoteHashReadsSet = new Set(futureNoteHashReads.map(scopedValueId));
  const futureNullifierReadsSet = new Set(futureNullifierReads.map(scopedValueId));
  const nullifierIndexMap: Map<number, number> = new Map();
  nullifiers.forEach((n, i) => nullifierIndexMap.set(n.counter, i));

  const logNoteHashMap: Map<number, number[]> = new Map();
  noteLogs.forEach((n, i) => {
    logNoteHashMap.set(n.noteHashCounter, (logNoteHashMap.get(n.noteHashCounter) || []).concat([i]));
  });

  const nullifierIndexesForNoteHashes: Tuple<number, NOTE_HASHES_LEN> = makeTuple(
    noteHashesLength,
    () => nullifiersLength,
  );

  const noteHashIndexesForNullifiers: Tuple<number, NULLIFIERS_LEN> = makeTuple(
    nullifiersLength,
    () => noteHashesLength,
  );

  const noteHashIndexesForLogs: Tuple<number, LOGS_LEN> = makeTuple(logsLength, () => noteHashesLength);

  const numNoteHashes = countAccumulatedItems(noteHashes);
  for (let i = 0; i < numNoteHashes; i++) {
    const noteHash = noteHashes[i];
    if (noteHash.nullifierCounter > 0) {
      const nullifierIndex = nullifierIndexMap.get(noteHash.nullifierCounter);
      if (nullifierIndex === undefined) {
        throw new Error('Unknown nullifier counter.');
      }

      const nullifier = nullifiers[nullifierIndex];
      if (!nullifier.nullifiedNoteHash.equals(noteHash.value)) {
        throw new Error('Hinted note hash does not match.');
      }
      if (!nullifier.contractAddress.equals(noteHash.contractAddress)) {
        throw new Error('Contract address of hinted note hash does not match.');
      }

      if (
        !futureNullifierReadsSet.has(scopedValueId(nullifier)) &&
        !futureNoteHashReadsSet.has(scopedValueId(noteHash))
      ) {
        const logIndices = logNoteHashMap.get(noteHash.counter);
        if (logIndices) {
          logIndices.forEach(logIndex => {
            noteHashIndexesForLogs[logIndex] = i;
          });
        }

        nullifierIndexesForNoteHashes[i] = nullifierIndex;
        noteHashIndexesForNullifiers[nullifierIndex] = i;
      }
    }
  }

  return [nullifierIndexesForNoteHashes, noteHashIndexesForNullifiers, noteHashIndexesForLogs];
}
