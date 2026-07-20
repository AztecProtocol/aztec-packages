import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { NoteDao } from '@aztec/stdlib/note';

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

  addScope(scope: string): void {
    this.scopes.add(scope);
  }
}
