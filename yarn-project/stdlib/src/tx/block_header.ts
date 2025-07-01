import { BLOCK_HEADER_LENGTH, GeneratorIndex } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { ContentCommitment } from './content_commitment.js';
import { GlobalVariables } from './global_variables.js';
import { ProposedBlockHeader } from './proposed_block_header.js';
import { StateReference } from './state_reference.js';

/** A header of an L2 block. */
export class BlockHeader {
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
  ) {}

  static get schema(): ZodFor<BlockHeader> {
    return z
      .object({
        lastArchive: AppendOnlyTreeSnapshot.schema,
        contentCommitment: ContentCommitment.schema,
        state: StateReference.schema,
        globalVariables: GlobalVariables.schema,
        totalFees: schemas.Fr,
        totalManaUsed: schemas.Fr,
      })
      .transform(BlockHeader.from);
  }

  static getFields(fields: FieldsOf<BlockHeader>) {
    // Note: The order here must match the order in the ProposedHeaderLib solidity library.
    return [
      fields.lastArchive,
      fields.contentCommitment,
      fields.state,
      fields.globalVariables,
      fields.totalFees,
      fields.totalManaUsed,
    ] as const;
  }

  static from(fields: FieldsOf<BlockHeader>) {
    return new BlockHeader(...BlockHeader.getFields(fields));
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
      this.totalManaUsed.size
    );
  }

  toBuffer() {
    return serializeToBuffer(...BlockHeader.getFields(this));
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...BlockHeader.getFields(this));
    if (fields.length !== BLOCK_HEADER_LENGTH) {
      throw new Error(`Invalid number of fields for Header. Expected ${BLOCK_HEADER_LENGTH}, got ${fields.length}`);
    }
    return fields;
  }

  clone(): BlockHeader {
    return BlockHeader.fromBuffer(this.toBuffer());
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockHeader {
    const reader = BufferReader.asReader(buffer);

    return new BlockHeader(
      reader.readObject(AppendOnlyTreeSnapshot),
      reader.readObject(ContentCommitment),
      reader.readObject(StateReference),
      reader.readObject(GlobalVariables),
      reader.readObject(Fr),
      reader.readObject(Fr),
    );
  }

  static fromFields(fields: Fr[] | FieldReader): BlockHeader {
    const reader = FieldReader.asReader(fields);

    return new BlockHeader(
      AppendOnlyTreeSnapshot.fromFields(reader),
      ContentCommitment.fromFields(reader),
      StateReference.fromFields(reader),
      GlobalVariables.fromFields(reader),
      reader.readField(),
      reader.readField(),
    );
  }

  static empty(fields: Partial<FieldsOf<BlockHeader>> = {}): BlockHeader {
    return BlockHeader.from({
      lastArchive: AppendOnlyTreeSnapshot.empty(),
      contentCommitment: ContentCommitment.empty(),
      state: StateReference.empty(),
      globalVariables: GlobalVariables.empty(),
      totalFees: Fr.ZERO,
      totalManaUsed: Fr.ZERO,
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
      this.totalManaUsed.isZero()
    );
  }

  /**
   * Serializes this instance into a string.
   * @returns Encoded string.
   */
  public toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string): BlockHeader {
    return BlockHeader.fromBuffer(hexToBuffer(str));
  }

  hash(): Promise<Fr> {
    return poseidon2HashWithSeparator(this.toFields(), GeneratorIndex.BLOCK_HASH);
  }

  toPropose(): ProposedBlockHeader {
    return new ProposedBlockHeader(
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

  toInspect() {
    return {
      lastArchive: this.lastArchive.root.toString(),
      contentCommitment: this.contentCommitment.toInspect(),
      state: this.state.toInspect(),
      globalVariables: this.globalVariables.toInspect(),
      totalFees: this.totalFees.toBigInt(),
      totalManaUsed: this.totalManaUsed.toBigInt(),
    };
  }

  [inspect.custom]() {
    return `Header {
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
}`;
  }

  public equals(other: this): boolean {
    return (
      this.contentCommitment.equals(other.contentCommitment) &&
      this.state.equals(other.state) &&
      this.globalVariables.equals(other.globalVariables) &&
      this.totalFees.equals(other.totalFees) &&
      this.totalManaUsed.equals(other.totalManaUsed) &&
      this.lastArchive.equals(other.lastArchive)
    );
  }
}
