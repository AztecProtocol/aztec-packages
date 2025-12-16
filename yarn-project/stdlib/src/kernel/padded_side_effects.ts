import { MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { PrivateLog } from '../logs/index.js';

export class PaddedSideEffects {
  constructor(
    public noteHashes: Tuple<Fr, typeof MAX_NOTE_HASHES_PER_TX>,
    public nullifiers: Tuple<Fr, typeof MAX_NULLIFIERS_PER_TX>,
    public privateLogs: Tuple<PrivateLog, typeof MAX_PRIVATE_LOGS_PER_TX>,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.noteHashes, this.nullifiers, this.privateLogs);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PaddedSideEffects(
      reader.readArray(MAX_NOTE_HASHES_PER_TX, Fr),
      reader.readArray(MAX_NULLIFIERS_PER_TX, Fr),
      reader.readArray(MAX_PRIVATE_LOGS_PER_TX, PrivateLog),
    );
  }

  static empty() {
    return new PaddedSideEffects(
      makeTuple(MAX_NOTE_HASHES_PER_TX, Fr.zero),
      makeTuple(MAX_NULLIFIERS_PER_TX, Fr.zero),
      makeTuple(MAX_PRIVATE_LOGS_PER_TX, PrivateLog.empty),
    );
  }
}

export class PaddedSideEffectAmounts {
  constructor(
    public nonRevertibleNoteHashes: number,
    public revertibleNoteHashes: number,
    public nonRevertibleNullifiers: number,
    public revertibleNullifiers: number,
    public nonRevertiblePrivateLogs: number,
    public revertiblePrivateLogs: number,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.nonRevertibleNoteHashes,
      this.revertibleNoteHashes,
      this.nonRevertibleNullifiers,
      this.revertibleNullifiers,
      this.nonRevertiblePrivateLogs,
      this.revertiblePrivateLogs,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PaddedSideEffectAmounts(
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
      reader.readNumber(),
    );
  }

  static empty() {
    return new PaddedSideEffectAmounts(0, 0, 0, 0, 0, 0);
  }
}
