import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { NoteDao } from '@aztec/stdlib/note';

/**
 * A stored foreign note, which includes the note data and its scopes.
 * Unlike regular notes, these are keyed by siloedNoteHash instead of siloedNullifier.
 */
export class StoredForeignNote {
  constructor(
    readonly noteDao: NoteDao,
    readonly siloedNoteHash: Fr,
    readonly scopes: Set<string>,
  ) {}

  static fromBuffer(buffer: Buffer) {
    const reader = BufferReader.asReader(buffer);

    const noteDao = NoteDao.fromBuffer(reader);
    const siloedNoteHash = Fr.fromBuffer(reader);
    const scopes = reader.readVector({ fromBuffer: (r: BufferReader) => r.readString() });

    return new StoredForeignNote(noteDao, siloedNoteHash, new Set(scopes));
  }

  toBuffer(): Buffer {
    const scopesArray = [...this.scopes];
    return serializeToBuffer(this.noteDao, this.siloedNoteHash, scopesArray.length, ...scopesArray);
  }

  addScope(scope: string) {
    this.scopes.add(scope);
  }
}
