import { PARTIAL_STATE_REFERENCE_LENGTH } from '@aztec/constants';
import type { ViemPartialStateReference } from '@aztec/ethereum';
import type { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';

/**
 * Stores snapshots of trees which are commonly needed by base or merge rollup circuits.
 */
export class PartialStateReference {
  constructor(
    /** Snapshot of the note hash tree. */
    public readonly noteHashTree: AppendOnlyTreeSnapshot,
    /** Snapshot of the nullifier tree. */
    public readonly nullifierTree: AppendOnlyTreeSnapshot,
    /** Snapshot of the public data tree. */
    public readonly publicDataTree: AppendOnlyTreeSnapshot,
  ) {}

  static get schema() {
    return z
      .object({
        noteHashTree: AppendOnlyTreeSnapshot.schema,
        nullifierTree: AppendOnlyTreeSnapshot.schema,
        publicDataTree: AppendOnlyTreeSnapshot.schema,
      })
      .transform(
        ({ noteHashTree, nullifierTree, publicDataTree }) =>
          new PartialStateReference(noteHashTree, nullifierTree, publicDataTree),
      );
  }

  getSize() {
    return this.noteHashTree.getSize() + this.nullifierTree.getSize() + this.publicDataTree.getSize();
  }

  static fromBuffer(buffer: Buffer | BufferReader): PartialStateReference {
    const reader = BufferReader.asReader(buffer);
    return new PartialStateReference(
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
    );
  }

  static fromFields(fields: Fr[] | FieldReader): PartialStateReference {
    const reader = FieldReader.asReader(fields);

    const noteHashTree = AppendOnlyTreeSnapshot.fromFields(reader);
    const nullifierTree = AppendOnlyTreeSnapshot.fromFields(reader);
    const publicDataTree = AppendOnlyTreeSnapshot.fromFields(reader);

    return new PartialStateReference(noteHashTree, nullifierTree, publicDataTree);
  }

  static fromViem(stateReference: ViemPartialStateReference) {
    return new PartialStateReference(
      AppendOnlyTreeSnapshot.fromViem(stateReference.noteHashTree),
      AppendOnlyTreeSnapshot.fromViem(stateReference.nullifierTree),
      AppendOnlyTreeSnapshot.fromViem(stateReference.publicDataTree),
    );
  }

  toViem(): ViemPartialStateReference {
    return {
      noteHashTree: this.noteHashTree.toViem(),
      nullifierTree: this.nullifierTree.toViem(),
      publicDataTree: this.publicDataTree.toViem(),
    };
  }

  toAbi(): [
    ReturnType<AppendOnlyTreeSnapshot['toAbi']>,
    ReturnType<AppendOnlyTreeSnapshot['toAbi']>,
    ReturnType<AppendOnlyTreeSnapshot['toAbi']>,
  ] {
    return [this.noteHashTree.toAbi(), this.nullifierTree.toAbi(), this.publicDataTree.toAbi()];
  }

  static empty(): PartialStateReference {
    return new PartialStateReference(
      AppendOnlyTreeSnapshot.empty(),
      AppendOnlyTreeSnapshot.empty(),
      AppendOnlyTreeSnapshot.empty(),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.noteHashTree, this.nullifierTree, this.publicDataTree);
  }

  toFields() {
    const fields = [
      ...this.noteHashTree.toFields(),
      ...this.nullifierTree.toFields(),
      ...this.publicDataTree.toFields(),
    ];
    if (fields.length !== PARTIAL_STATE_REFERENCE_LENGTH) {
      throw new Error(
        `Invalid number of fields for PartialStateReference. Expected ${PARTIAL_STATE_REFERENCE_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  isEmpty(): boolean {
    return this.noteHashTree.isEmpty() && this.nullifierTree.isEmpty() && this.publicDataTree.isEmpty();
  }

  public equals(other: this): boolean {
    return (
      this.noteHashTree.equals(other.noteHashTree) &&
      this.nullifierTree.equals(other.nullifierTree) &&
      this.publicDataTree.equals(other.publicDataTree)
    );
  }
}
