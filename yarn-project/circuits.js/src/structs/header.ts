import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import { serializeToBuffer } from '../utils/serialize.js';
import { GlobalVariables } from './global_variables.js';
import { AppendOnlyTreeSnapshot } from './rollup/append_only_tree_snapshot.js';
import { StateReference } from './state_reference.js';

/** A header of an L2 block. */
export class Header {
  constructor(
    /** Snapshot of archive before the block is applied. */
    public lastArchive: AppendOnlyTreeSnapshot,
    /** Hash of the body of an L2 block. */
    public bodyHash: [Fr, Fr],
    /** State reference. */
    public state: StateReference,
    /** Global variables of an L2 block. */
    public globalVariables: GlobalVariables,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.lastArchive, this.bodyHash, this.state, this.globalVariables);
  }

  static fromBuffer(buffer: Buffer | BufferReader): Header {
    const reader = BufferReader.asReader(buffer);
    return new Header(
      reader.readObject(AppendOnlyTreeSnapshot),
      [reader.readObject(Fr), reader.readObject(Fr)],
      reader.readObject(StateReference),
      reader.readObject(GlobalVariables),
    );
  }
}
