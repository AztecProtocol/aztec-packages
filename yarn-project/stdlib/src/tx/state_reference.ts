import {
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  STATE_REFERENCE_LENGTH,
} from '@aztec/constants';
import type { ViemStateReference } from '@aztec/ethereum';
import type { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { PartialStateReference } from './partial_state_reference.js';

/**
 * Stores snapshots of all the trees but archive.
 */
export class StateReference {
  constructor(
    /** Snapshot of the l1 to l2 message tree. */
    public l1ToL2MessageTree: AppendOnlyTreeSnapshot,
    /** Reference to the rest of the state. */
    public partial: PartialStateReference,
  ) {}

  static get schema() {
    return z
      .object({
        l1ToL2MessageTree: AppendOnlyTreeSnapshot.schema,
        partial: PartialStateReference.schema,
      })
      .transform(({ l1ToL2MessageTree, partial }) => new StateReference(l1ToL2MessageTree, partial));
  }

  getSize() {
    return this.l1ToL2MessageTree.getSize() + this.partial.getSize();
  }

  toBuffer() {
    // Note: The order here must match the order in the ProposedHeaderLib solidity library.
    return serializeToBuffer(this.l1ToL2MessageTree, this.partial);
  }

  toFields(): Fr[] {
    const fields = [...this.l1ToL2MessageTree.toFields(), ...this.partial.toFields()];
    if (fields.length !== STATE_REFERENCE_LENGTH) {
      throw new Error(
        `Invalid number of fields for StateReference. Expected ${STATE_REFERENCE_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromBuffer(buffer: Buffer | BufferReader): StateReference {
    const reader = BufferReader.asReader(buffer);
    return new StateReference(reader.readObject(AppendOnlyTreeSnapshot), reader.readObject(PartialStateReference));
  }

  static fromFields(fields: Fr[] | FieldReader): StateReference {
    const reader = FieldReader.asReader(fields);

    const l1ToL2MessageTree = AppendOnlyTreeSnapshot.fromFields(reader);
    const partial = PartialStateReference.fromFields(reader);

    return new StateReference(l1ToL2MessageTree, partial);
  }

  static fromViem(stateReference: ViemStateReference) {
    return new StateReference(
      AppendOnlyTreeSnapshot.fromViem(stateReference.l1ToL2MessageTree),
      PartialStateReference.fromViem(stateReference.partialStateReference),
    );
  }

  static empty(): StateReference {
    return new StateReference(AppendOnlyTreeSnapshot.empty(), PartialStateReference.empty());
  }

  toViem(): ViemStateReference {
    return {
      l1ToL2MessageTree: this.l1ToL2MessageTree.toViem(),
      partialStateReference: this.partial.toViem(),
    };
  }

  toAbi(): [ReturnType<AppendOnlyTreeSnapshot['toAbi']>, ReturnType<PartialStateReference['toAbi']>] {
    return [this.l1ToL2MessageTree.toAbi(), [...this.partial.toAbi()]];
  }

  isEmpty(): boolean {
    return this.l1ToL2MessageTree.isEmpty() && this.partial.isEmpty();
  }

  toInspect() {
    return {
      l1ToL2MessageTree: this.l1ToL2MessageTree.root.toString(),
      noteHashTree: this.partial.noteHashTree.root.toString(),
      nullifierTree: this.partial.nullifierTree.root.toString(),
      publicDataTree: this.partial.publicDataTree.root.toString(),
    };
  }

  /**
   * Validates the trees in world state have the expected number of leaves (multiple of number of insertions per tx)
   */
  public validate() {
    if (this.l1ToL2MessageTree.nextAvailableLeafIndex % NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP !== 0) {
      throw new Error(
        `Invalid L1 to L2 message tree next available leaf index ${this.l1ToL2MessageTree.nextAvailableLeafIndex} (must be a multiple of ${NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP})`,
      );
    }
    if (this.partial.noteHashTree.nextAvailableLeafIndex % MAX_NOTE_HASHES_PER_TX !== 0) {
      throw new Error(
        `Invalid note hash tree next available leaf index ${this.partial.noteHashTree.nextAvailableLeafIndex} (must be a multiple of ${MAX_NOTE_HASHES_PER_TX})`,
      );
    }
    if (this.partial.nullifierTree.nextAvailableLeafIndex % MAX_NULLIFIERS_PER_TX !== 0) {
      throw new Error(
        `Invalid nullifier tree next available leaf index ${this.partial.nullifierTree.nextAvailableLeafIndex} (must be a multiple of ${MAX_NULLIFIERS_PER_TX})`,
      );
    }
  }

  [inspect.custom]() {
    return `StateReference {
  l1ToL2MessageTree: ${inspect(this.l1ToL2MessageTree)},
  noteHashTree: ${inspect(this.partial.noteHashTree)},
  nullifierTree: ${inspect(this.partial.nullifierTree)},
  publicDataTree: ${inspect(this.partial.publicDataTree)},
}`;
  }

  public equals(other: this): boolean {
    return this.l1ToL2MessageTree.root.equals(other.l1ToL2MessageTree.root) && this.partial.equals(other.partial);
  }
}
