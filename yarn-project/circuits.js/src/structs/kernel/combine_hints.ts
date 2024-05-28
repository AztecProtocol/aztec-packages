import { type FieldsOf } from '@aztec/foundation/array';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import {
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
} from '../../constants.gen.js';
import { LogHash } from '../log_hash.js';
import { NoteHash } from '../note_hash.js';
import { PublicDataUpdateRequest } from '../public_data_update_request.js';

export class CombineHints {
  constructor(
    public readonly sortedNoteHashes: Tuple<NoteHash, typeof MAX_NEW_NOTE_HASHES_PER_TX>,
    public readonly sortedNoteHashesIndexes: Tuple<number, typeof MAX_NEW_NOTE_HASHES_PER_TX>,
    public readonly sortedUnencryptedLogsHashes: Tuple<LogHash, typeof MAX_UNENCRYPTED_LOGS_PER_TX>,
    public readonly sortedUnencryptedLogsHashesIndexes: Tuple<number, typeof MAX_UNENCRYPTED_LOGS_PER_TX>,
    public readonly sortedPublicDataUpdateRequests: Tuple<
      PublicDataUpdateRequest,
      typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    >,
    public readonly sortedPublicDataUpdateRequestsIndexes: Tuple<number, typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
  ) {}

  static getFields(fields: FieldsOf<CombineHints>) {
    return [
      fields.sortedNoteHashes,
      fields.sortedNoteHashesIndexes,
      fields.sortedUnencryptedLogsHashes,
      fields.sortedUnencryptedLogsHashesIndexes,
      fields.sortedPublicDataUpdateRequests,
      fields.sortedPublicDataUpdateRequestsIndexes,
    ] as const;
  }

  static from(fields: FieldsOf<CombineHints>): CombineHints {
    return new CombineHints(...CombineHints.getFields(fields));
  }

  toBuffer() {
    return serializeToBuffer(...CombineHints.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CombineHints(
      reader.readArray(MAX_NEW_NOTE_HASHES_PER_TX, NoteHash),
      reader.readNumbers(MAX_NEW_NOTE_HASHES_PER_TX),
      reader.readArray(MAX_UNENCRYPTED_LOGS_PER_TX, LogHash),
      reader.readNumbers(MAX_UNENCRYPTED_LOGS_PER_TX),
      reader.readArray(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataUpdateRequest),
      reader.readNumbers(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX),
    );
  }
}
