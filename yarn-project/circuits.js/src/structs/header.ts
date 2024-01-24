import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer, to2Fields } from '@aztec/foundation/serialize';

import { HEADER_LENGTH } from '../constants.gen.js';
import { GlobalVariables } from './global_variables.js';
import { AppendOnlyTreeSnapshot } from './rollup/append_only_tree_snapshot.js';
import { StateReference } from './state_reference.js';

export const NUM_BYTES_PER_SHA256 = 32;

/** A header of an L2 block. */
export class Header {
  constructor(
    /** Snapshot of archive before the block is applied. */
    public lastArchive: AppendOnlyTreeSnapshot,
    /** Hash of the body of an L2 block. */
    public bodyHash: Buffer,
    /** State reference. */
    public state: StateReference,
    /** Global variables of an L2 block. */
    public globalVariables: GlobalVariables,
  ) {
    if (bodyHash.length !== 32) {
      throw new Error('Body hash buffer must be 32 bytes');
    }
  }

  toBuffer() {
    // Note: The order here must match the order in the HeaderLib solidity library.
    return serializeToBuffer(this.lastArchive, this.bodyHash, this.state, this.globalVariables);
  }

  toFieldArray(): Fr[] {
    // Note: The order here must match the order in the HeaderDecoder solidity library.
    const serialized = [
      ...this.globalVariables.toFieldArray(),
      ...this.state.toFieldArray(),
      ...this.lastArchive.toFieldArray(),
      ...to2Fields(this.bodyHash),
    ];
    if (serialized.length !== HEADER_LENGTH) {
      throw new Error(`Expected header to have ${HEADER_LENGTH} fields, but it has ${serialized.length} fields`);
    }
    return serialized;
  }

  static fromBuffer(buffer: Buffer | BufferReader): Header {
    const reader = BufferReader.asReader(buffer);

    return new Header(
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readBytes(NUM_BYTES_PER_SHA256),
      reader.readObject(StateReference),
      reader.readObject(GlobalVariables),
    );
  }

  static empty(): Header {
    return new Header(
      AppendOnlyTreeSnapshot.empty(),
      Buffer.alloc(NUM_BYTES_PER_SHA256),
      StateReference.empty(),
      GlobalVariables.empty(),
    );
  }

  isEmpty(): boolean {
    return (
      this.lastArchive.isEmpty() &&
      this.bodyHash.equals(Buffer.alloc(NUM_BYTES_PER_SHA256)) &&
      this.state.isEmpty() &&
      this.globalVariables.isEmpty()
    );
  }

  static fromString(str: string): Header {
    const buffer = Buffer.from(str.replace(/^0x/i, ''), 'hex');
    return Header.fromBuffer(buffer);
  }
}
