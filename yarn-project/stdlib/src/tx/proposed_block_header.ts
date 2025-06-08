import { sha256ToField } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { ZodFor } from '@aztec/foundation/schemas';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { GasFees } from '../gas/index.js';
import { schemas } from '../schemas/index.js';
import type { UInt64 } from '../types/shared.js';
import { ContentCommitment } from './content_commitment.js';

/** The proposed values of an L2 block. */
export class ProposedBlockHeader {
  constructor(
    /** Root of the archive tree before this block is added. */
    public lastArchiveRoot: Fr,
    /** Content commitment of the L2 block. */
    public contentCommitment: ContentCommitment,
    /** Slot number of the L2 block */
    public slotNumber: Fr,
    /** Timestamp of the L2 block. */
    public timestamp: UInt64,
    /** Recipient of block reward. */
    public coinbase: EthAddress,
    /** Address to receive fees. */
    public feeRecipient: AztecAddress,
    /** Global gas prices for this block. */
    public gasFees: GasFees,
    /** Total mana used in the block, computed by the root rollup circuit */
    public totalManaUsed: Fr,
  ) {}

  static get schema(): ZodFor<ProposedBlockHeader> {
    return z
      .object({
        lastArchiveRoot: schemas.Fr,
        contentCommitment: ContentCommitment.schema,
        slotNumber: schemas.Fr,
        timestamp: schemas.BigInt,
        coinbase: schemas.EthAddress,
        feeRecipient: schemas.AztecAddress,
        gasFees: GasFees.schema,
        totalManaUsed: schemas.Fr,
      })
      .transform(ProposedBlockHeader.from);
  }

  static getFields(fields: FieldsOf<ProposedBlockHeader>) {
    return [
      fields.lastArchiveRoot,
      fields.contentCommitment,
      fields.slotNumber,
      fields.timestamp,
      fields.coinbase,
      fields.feeRecipient,
      fields.gasFees,
      fields.totalManaUsed,
    ] as const;
  }

  static from(fields: FieldsOf<ProposedBlockHeader>) {
    return new ProposedBlockHeader(...ProposedBlockHeader.getFields(fields));
  }

  static fromBuffer(buffer: Buffer | BufferReader): ProposedBlockHeader {
    const reader = BufferReader.asReader(buffer);

    return new ProposedBlockHeader(
      reader.readObject(Fr),
      reader.readObject(ContentCommitment),
      Fr.fromBuffer(reader),
      reader.readUInt64(),
      reader.readObject(EthAddress),
      reader.readObject(AztecAddress),
      reader.readObject(GasFees),
      reader.readObject(Fr),
    );
  }

  toBuffer() {
    // Note: The order here must match the order in the HeaderLib solidity library.
    return serializeToBuffer([
      this.lastArchiveRoot,
      this.contentCommitment,
      this.slotNumber,
      bigintToUInt64BE(this.timestamp),
      this.coinbase,
      this.feeRecipient,
      this.gasFees,
      this.totalManaUsed,
    ]);
  }

  hash(): Fr {
    return sha256ToField([this.toBuffer()]);
  }

  static empty(fields: Partial<FieldsOf<ProposedBlockHeader>> = {}): ProposedBlockHeader {
    return ProposedBlockHeader.from({
      lastArchiveRoot: Fr.ZERO,
      contentCommitment: ContentCommitment.empty(),
      slotNumber: Fr.ZERO,
      timestamp: 0n,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
      totalManaUsed: Fr.ZERO,
      ...fields,
    });
  }

  isEmpty(): boolean {
    return (
      this.lastArchiveRoot.isZero() &&
      this.contentCommitment.isEmpty() &&
      this.slotNumber.isZero() &&
      this.timestamp === 0n &&
      this.coinbase.isZero() &&
      this.feeRecipient.isZero() &&
      this.gasFees.isEmpty() &&
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

  static fromString(str: string): ProposedBlockHeader {
    return ProposedBlockHeader.fromBuffer(hexToBuffer(str));
  }

  toInspect() {
    return {
      lastArchive: this.lastArchiveRoot.toString(),
      contentCommitment: this.contentCommitment.toInspect(),
      slotNumber: this.slotNumber.toBigInt(),
      timestamp: this.timestamp,
      coinbase: this.coinbase.toString(),
      feeRecipient: this.feeRecipient.toString(),
      gasFees: this.gasFees.toInspect(),
      totalManaUsed: this.totalManaUsed.toBigInt(),
    };
  }

  [inspect.custom]() {
    const gasfees = `da:${this.gasFees.feePerDaGas}, l2:${this.gasFees.feePerL2Gas}`;
    return `Header {
  lastArchiveRoot: ${this.lastArchiveRoot.toString()},
  contentCommitment: ${inspect(this.contentCommitment)},
  slotNumber: ${this.slotNumber.toBigInt()},
  timestamp: ${this.timestamp},
  coinbase: ${this.coinbase.toString()},
  feeRecipient: ${this.feeRecipient.toString()},
  gasFees: ${gasfees},
  totalManaUsed: ${this.totalManaUsed.toBigInt()},
}`;
  }
}
