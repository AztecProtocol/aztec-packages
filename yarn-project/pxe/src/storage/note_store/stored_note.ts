import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { NoteDao } from '@aztec/stdlib/note';

import type { L2BlockId } from '../foundation/index.js';

/** A note as stored by the PXE: the note DAO plus the scopes that observed it. Append-only — never mutated. */
export class StoredNote {
  constructor(
    readonly noteDao: NoteDao,
    readonly scopes: Set<string>,
  ) {}

  static fromBuffer(buffer: Buffer): StoredNote {
    const reader = BufferReader.asReader(buffer);
    const noteDao = NoteDao.fromBuffer(reader);
    const scopes = reader.readVector({ fromBuffer: (r: BufferReader) => r.readString() });
    return new StoredNote(noteDao, new Set(scopes));
  }

  toBuffer(): Buffer {
    const scopesArray = [...this.scopes];
    return serializeToBuffer(this.noteDao, scopesArray.length, ...scopesArray);
  }

  /** The chain location that created this note — used as its canonicality coordinate. */
  get creationOrigin(): L2BlockId {
    return { number: this.noteDao.l2BlockNumber, hash: this.noteDao.l2BlockHash };
  }

  addScope(scope: string): void {
    this.scopes.add(scope);
  }
}
