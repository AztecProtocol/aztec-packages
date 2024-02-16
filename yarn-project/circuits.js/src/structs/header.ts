import { pedersenHash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { GeneratorIndex, HEADER_LENGTH } from '../constants.gen.js';
import { BlockContentCommitments } from './block_content_commitments.js';
import { GlobalVariables } from './global_variables.js';
import { AppendOnlyTreeSnapshot } from './rollup/append_only_tree_snapshot.js';
import { StateReference } from './state_reference.js';

/** A header of an L2 block. */
export class Header {
  constructor(
    /** Snapshot of archive before the block is applied. */
    public lastArchive: AppendOnlyTreeSnapshot,
    /** Hash of the body of an L2 block. */
    public blockContentCommitments: BlockContentCommitments,
    /** State reference. */
    public state: StateReference,
    /** Global variables of an L2 block. */
    public globalVariables: GlobalVariables,
  ) {}

  toBuffer() {
    // Note: The order here must match the order in the HeaderLib solidity library.
    return serializeToBuffer(this.lastArchive, this.blockContentCommitments, this.state, this.globalVariables);
  }

  toFields(): Fr[] {
    // Note: The order here must match the order in header.nr
    const serialized = [
      ...this.lastArchive.toFields(),
      ...this.blockContentCommitments.toFields(),
      ...this.state.toFields(),
      ...this.globalVariables.toFields(),
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
      reader.readObject(BlockContentCommitments),
      reader.readObject(StateReference),
      reader.readObject(GlobalVariables),
    );
  }

  static fromFields(fields: Fr[] | FieldReader): Header {
    const reader = FieldReader.asReader(fields);

    const lastArchive = new AppendOnlyTreeSnapshot(reader.readField(), Number(reader.readField().toBigInt()));
    const blockContentCommitments = BlockContentCommitments.fromFields(reader);
    const state = StateReference.fromFields(reader);
    const globalVariables = GlobalVariables.fromFields(reader);

    return new Header(lastArchive, blockContentCommitments, state, globalVariables);
  }

  static empty(): Header {
    return new Header(
      AppendOnlyTreeSnapshot.zero(),
      BlockContentCommitments.empty(),
      StateReference.empty(),
      GlobalVariables.empty(),
    );
  }

  isEmpty(): boolean {
    return (
      this.lastArchive.isZero() &&
      this.blockContentCommitments.isEmpty() &&
      this.state.isEmpty() &&
      this.globalVariables.isEmpty()
    );
  }

  /**
   * Serializes this instance into a string.
   * @returns Encoded string.
   */
  public toString(): string {
    return this.toBuffer().toString('hex');
  }

  static fromString(str: string): Header {
    const buffer = Buffer.from(str.replace(/^0x/i, ''), 'hex');
    return Header.fromBuffer(buffer);
  }

  hash(): Fr {
    return Fr.fromBuffer(
      pedersenHash(
        this.toFields().map(f => f.toBuffer()),
        GeneratorIndex.BLOCK_HASH,
      ),
    );
  }
}
