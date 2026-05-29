import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { NoteDao } from '@aztec/stdlib/note';

import type { Origin } from '../foundation/origin.js';

export class StoredNote {
  constructor(
    readonly noteDao: NoteDao,
    readonly scopes: Set<string>,
    /**
     * The L2 chain position at which this note was nullified, or `undefined` if it has not been nullified.
     *
     * Storing the full origin (number + hash) rather than just the block number lets the read path filter
     * nullifications by canonicality: if a soft reorg orphans the nullification's block, the note re-appears as
     * active without any destructive bookkeeping.
     */
    private _nullifiedAt: Origin | undefined = undefined,
  ) {}

  static fromBuffer(buffer: Buffer) {
    const reader = BufferReader.asReader(buffer);

    const noteDao = NoteDao.fromBuffer(reader);
    const scopes = reader.readVector({ fromBuffer: (r: BufferReader) => r.readString() });

    const hasNullification = reader.readNumber();
    const nullifiedAt =
      hasNullification === 0 ? undefined : { blockNumber: reader.readNumber(), blockHash: reader.readString() };

    return new StoredNote(noteDao, new Set(scopes), nullifiedAt);
  }

  toBuffer(): Buffer {
    const scopesArray = [...this.scopes];
    if (this._nullifiedAt) {
      return serializeToBuffer(
        this.noteDao,
        scopesArray.length,
        ...scopesArray,
        1,
        this._nullifiedAt.blockNumber,
        this._nullifiedAt.blockHash,
      );
    }
    return serializeToBuffer(this.noteDao, scopesArray.length, ...scopesArray, 0);
  }

  addScope(scope: string) {
    this.scopes.add(scope);
  }

  markAsNullified(origin: Origin) {
    this._nullifiedAt = origin;
  }

  markAsActive() {
    this._nullifiedAt = undefined;
  }

  isNullified() {
    return this._nullifiedAt !== undefined;
  }

  get nullifiedAt(): Origin | undefined {
    return this._nullifiedAt;
  }
}
