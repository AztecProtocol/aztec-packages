import { TREE_SNAPSHOTS_LENGTH } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';

/**
 * Stores snapshots of all the trees but archive.
 */
export class TreeSnapshots {
  constructor(
    public readonly l1ToL2MessageTree: AppendOnlyTreeSnapshot,
    public readonly noteHashTree: AppendOnlyTreeSnapshot,
    public readonly nullifierTree: AppendOnlyTreeSnapshot,
    public readonly publicDataTree: AppendOnlyTreeSnapshot,
  ) {}

  static get schema() {
    return z
      .object({
        l1ToL2MessageTree: AppendOnlyTreeSnapshot.schema,
        noteHashTree: AppendOnlyTreeSnapshot.schema,
        nullifierTree: AppendOnlyTreeSnapshot.schema,
        publicDataTree: AppendOnlyTreeSnapshot.schema,
      })
      .transform(
        ({ l1ToL2MessageTree, noteHashTree, nullifierTree, publicDataTree }) =>
          new TreeSnapshots(l1ToL2MessageTree, noteHashTree, nullifierTree, publicDataTree),
      );
  }

  getSize() {
    return (
      this.l1ToL2MessageTree.getSize() +
      this.noteHashTree.getSize() +
      this.nullifierTree.getSize() +
      this.publicDataTree.getSize()
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): TreeSnapshots {
    const reader = BufferReader.asReader(buffer);
    return new TreeSnapshots(
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(AppendOnlyTreeSnapshot),
    );
  }

  toBuffer() {
    // Note: The order here must match the order in the HeaderLib solidity library.
    return serializeToBuffer(this.l1ToL2MessageTree, this.noteHashTree, this.nullifierTree, this.publicDataTree);
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);

    const l1ToL2MessageTree = AppendOnlyTreeSnapshot.fromFields(reader);
    const noteHashTree = AppendOnlyTreeSnapshot.fromFields(reader);
    const nullifierTree = AppendOnlyTreeSnapshot.fromFields(reader);
    const publicDataTree = AppendOnlyTreeSnapshot.fromFields(reader);

    return new TreeSnapshots(l1ToL2MessageTree, noteHashTree, nullifierTree, publicDataTree);
  }

  toFields(): Fr[] {
    const fields = [
      ...this.l1ToL2MessageTree.toFields(),
      ...this.noteHashTree.toFields(),
      ...this.nullifierTree.toFields(),
      ...this.publicDataTree.toFields(),
    ];
    if (fields.length !== TREE_SNAPSHOTS_LENGTH) {
      throw new Error(
        `Invalid number of fields for TreeSnapshots. Expected ${TREE_SNAPSHOTS_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static empty(): TreeSnapshots {
    return new TreeSnapshots(
      AppendOnlyTreeSnapshot.empty(),
      AppendOnlyTreeSnapshot.empty(),
      AppendOnlyTreeSnapshot.empty(),
      AppendOnlyTreeSnapshot.empty(),
    );
  }

  isEmpty(): boolean {
    return (
      this.l1ToL2MessageTree.isEmpty() &&
      this.noteHashTree.isEmpty() &&
      this.nullifierTree.isEmpty() &&
      this.publicDataTree.isEmpty()
    );
  }

  [inspect.custom]() {
    return `TreeSnapshots {
  l1ToL2MessageTree: ${inspect(this.l1ToL2MessageTree)},
  noteHashTree: ${inspect(this.noteHashTree)},
  nullifierTree: ${inspect(this.nullifierTree)},
  publicDataTree: ${inspect(this.publicDataTree)},
}`;
  }
}
