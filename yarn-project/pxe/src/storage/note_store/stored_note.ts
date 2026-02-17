import { BlockNumber } from '@aztec/foundation/branded-types';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { NoteDao } from '@aztec/stdlib/note';

export class StoredNote {
  constructor(
    readonly noteDao: NoteDao,
    readonly scopes: Set<string>,
    private _nullifiedAt: BlockNumber | undefined = undefined,
  ) {}

  static fromBuffer(buffer: Buffer) {
    const reader = BufferReader.asReader(buffer);

    const noteDao = NoteDao.fromBuffer(reader);
    const scopes = reader.readVector({ fromBuffer: (r: BufferReader) => r.readString() });

    const nullifiedAtRaw = reader.readNumber();
    const nullifiedAt = nullifiedAtRaw === 0 ? undefined : (nullifiedAtRaw as BlockNumber);

    return new StoredNote(noteDao, new Set(scopes), nullifiedAt);
  }

  toBuffer(): Buffer {
    const scopesArray = [...this.scopes];
    return serializeToBuffer(this.noteDao, scopesArray.length, ...scopesArray, this._nullifiedAt ?? 0);
  }

  addScope(scope: string) {
    this.scopes.add(scope);
  }

  markAsNullified(blockNumber: BlockNumber) {
    this._nullifiedAt = blockNumber;
  }

  markAsActive() {
    this._nullifiedAt = undefined;
  }

  isNullified() {
    return this._nullifiedAt !== undefined;
  }

  get nullifiedAt() {
    return this._nullifiedAt;
  }
}
