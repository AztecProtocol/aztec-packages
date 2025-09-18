import { Fr } from '@aztec/foundation/fields';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { BlockHeader, ContentCommitment, GlobalVariables, StateReference } from '../tx/index.js';

/**
 * TO BE DELETED
 *
 * A header of an L2 block combining the block header and the checkpoint header.
 * This is a temporary workaround to avoid changing too many things before building in chunks is properly implemented.
 * This works for now because we only have one block per checkpoint.
 *
 * @deprecated Use BlockHeader or CheckpointHeader instead.
 */
export class L2BlockHeader {
  constructor(
    /** Snapshot of archive before the block is applied. */
    public lastArchive: AppendOnlyTreeSnapshot,
    /** Hash of the body of an L2 block. */
    public contentCommitment: ContentCommitment,
    /** State reference. */
    public state: StateReference,
    /** Global variables of an L2 block. */
    public globalVariables: GlobalVariables,
    /** Total fees in the block, computed by the root rollup circuit */
    public totalFees: Fr,
    /** Total mana used in the block, computed by the root rollup circuit */
    public totalManaUsed: Fr,
    /** Hash of the sponge blob of the block. */
    public spongeBlobHash: Fr,
  ) {}

  static get schema(): ZodFor<L2BlockHeader> {
    return z
      .object({
        lastArchive: AppendOnlyTreeSnapshot.schema,
        contentCommitment: ContentCommitment.schema,
        state: StateReference.schema,
        globalVariables: GlobalVariables.schema,
        totalFees: schemas.Fr,
        totalManaUsed: schemas.Fr,
        spongeBlobHash: schemas.Fr,
      })
      .transform(L2BlockHeader.from);
  }

  static getFields(fields: FieldsOf<L2BlockHeader>) {
    return [
      fields.lastArchive,
      fields.contentCommitment,
      fields.state,
      fields.globalVariables,
      fields.totalFees,
      fields.totalManaUsed,
      fields.spongeBlobHash,
    ] as const;
  }

  static from(fields: FieldsOf<L2BlockHeader>) {
    return new L2BlockHeader(...L2BlockHeader.getFields(fields));
  }

  getSlot() {
    return this.globalVariables.slotNumber.toBigInt();
  }

  getBlockNumber() {
    return this.globalVariables.blockNumber;
  }

  getSize() {
    return (
      this.lastArchive.getSize() +
      this.contentCommitment.getSize() +
      this.state.getSize() +
      this.globalVariables.getSize() +
      this.totalFees.size +
      this.totalManaUsed.size +
      this.spongeBlobHash.size
    );
  }

  toBuffer() {
    return serializeToBuffer(...L2BlockHeader.getFields(this));
  }

  toFields(): Fr[] {
    return serializeToFields(...L2BlockHeader.getFields(this));
  }

  clone() {
    return L2BlockHeader.fromBuffer(this.toBuffer());
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    return new L2BlockHeader(
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(ContentCommitment),
      reader.readObject(StateReference),
      reader.readObject(GlobalVariables),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(Fr),
    );
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);

    return new L2BlockHeader(
      AppendOnlyTreeSnapshot.fromFields(reader),
      ContentCommitment.fromFields(reader),
      StateReference.fromFields(reader),
      GlobalVariables.fromFields(reader),
      reader.readField(),
      reader.readField(),
      reader.readField(),
    );
  }

  static empty(fields: Partial<FieldsOf<L2BlockHeader>> = {}) {
    return L2BlockHeader.from({
      lastArchive: AppendOnlyTreeSnapshot.empty(),
      contentCommitment: ContentCommitment.empty(),
      state: StateReference.empty(),
      globalVariables: GlobalVariables.empty(),
      totalFees: Fr.ZERO,
      totalManaUsed: Fr.ZERO,
      spongeBlobHash: Fr.ZERO,
      ...fields,
    });
  }

  isEmpty(): boolean {
    return (
      this.lastArchive.isEmpty() &&
      this.contentCommitment.isEmpty() &&
      this.state.isEmpty() &&
      this.globalVariables.isEmpty() &&
      this.totalFees.isZero() &&
      this.totalManaUsed.isZero() &&
      this.spongeBlobHash.isZero()
    );
  }

  /**
   * Serializes this instance into a string.
   * @returns Encoded string.
   */
  public toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return L2BlockHeader.fromBuffer(hexToBuffer(str));
  }

  toCheckpointHeader() {
    return new CheckpointHeader(
      this.lastArchive.root,
      this.contentCommitment,
      this.globalVariables.slotNumber,
      this.globalVariables.timestamp,
      this.globalVariables.coinbase,
      this.globalVariables.feeRecipient,
      this.globalVariables.gasFees,
      this.totalManaUsed,
    );
  }

  toBlockHeader() {
    return new BlockHeader(
      this.lastArchive,
      this.state,
      this.spongeBlobHash,
      this.globalVariables,
      this.totalFees,
      this.totalManaUsed,
    );
  }

  toInspect() {
    return {
      lastArchive: this.lastArchive.root.toString(),
      contentCommitment: this.contentCommitment.toInspect(),
      state: this.state.toInspect(),
      globalVariables: this.globalVariables.toInspect(),
      totalFees: this.totalFees.toBigInt(),
      totalManaUsed: this.totalManaUsed.toBigInt(),
      spongeBlobHash: this.spongeBlobHash.toString(),
    };
  }

  [inspect.custom]() {
    return `L2BlockHeader {
  lastArchive: ${inspect(this.lastArchive)},
  contentCommitment.blobsHash: ${inspect(this.contentCommitment.blobsHash)},
  contentCommitment.inHash: ${inspect(this.contentCommitment.inHash)},
  contentCommitment.outHash: ${inspect(this.contentCommitment.outHash)},
  state.l1ToL2MessageTree: ${inspect(this.state.l1ToL2MessageTree)},
  state.noteHashTree: ${inspect(this.state.partial.noteHashTree)},
  state.nullifierTree: ${inspect(this.state.partial.nullifierTree)},
  state.publicDataTree: ${inspect(this.state.partial.publicDataTree)},
  globalVariables: ${inspect(this.globalVariables)},
  totalFees: ${this.totalFees},
  totalManaUsed: ${this.totalManaUsed},
  spongeBlobHash: ${this.spongeBlobHash},
}`;
  }

  public equals(other: this): boolean {
    return (
      this.contentCommitment.equals(other.contentCommitment) &&
      this.state.equals(other.state) &&
      this.globalVariables.equals(other.globalVariables) &&
      this.totalFees.equals(other.totalFees) &&
      this.totalManaUsed.equals(other.totalManaUsed) &&
      this.lastArchive.equals(other.lastArchive) &&
      this.spongeBlobHash.equals(other.spongeBlobHash)
    );
  }
}
