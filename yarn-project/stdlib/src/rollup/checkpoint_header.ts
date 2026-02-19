import type { ViemHeader } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ZodFor } from '@aztec/foundation/schemas';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { GasFees } from '../gas/index.js';
import { schemas } from '../schemas/index.js';
import type { GlobalVariables } from '../tx/global_variables.js';
import type { UInt64 } from '../types/shared.js';

/**
 * Header of a checkpoint. A checkpoint is a collection of blocks submitted to L1 all within the same slot.
 * This header is verified as-is in the rollup circuits, posted to the L1 rollup contract, stored in the archiver,
 * and exposed via the Aztec Node API. See `CheckpointData` for a struct that includes the header plus extra metadata.
 */
export class CheckpointHeader {
  constructor(
    /** Root of the archive tree before this block is added. */
    public lastArchiveRoot: Fr,
    /** Hash of the headers of all blocks in this checkpoint. */
    public blockHeadersHash: Fr,
    /** Hash of the blobs in the checkpoint. */
    public blobsHash: Fr,
    /** Root of the l1 to l2 messages subtree. */
    public inHash: Fr,
    /**
     * The root of the epoch out hash balanced tree. The out hash of the first checkpoint in the epoch is inserted at
     * index 0, the second at index 1, and so on.
     * Note: This is not necessarily the final epoch out hash. It includes only the out hashes of checkpoints up to and
     * including the current checkpoint. Any subsequent checkpoints added to the same epoch are not reflected in this
     * value.
     */
    public epochOutHash: Fr,
    /** Slot number of the L2 block */
    public slotNumber: SlotNumber,
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

  static get schema(): ZodFor<CheckpointHeader> {
    return z
      .object({
        lastArchiveRoot: schemas.Fr,
        blockHeadersHash: schemas.Fr,
        blobsHash: schemas.Fr,
        inHash: schemas.Fr,
        epochOutHash: schemas.Fr,
        slotNumber: schemas.SlotNumber,
        timestamp: schemas.BigInt,
        coinbase: schemas.EthAddress,
        feeRecipient: schemas.AztecAddress,
        gasFees: GasFees.schema,
        totalManaUsed: schemas.Fr,
      })
      .transform(CheckpointHeader.from);
  }

  static getFields(fields: FieldsOf<CheckpointHeader>) {
    return [
      fields.lastArchiveRoot,
      fields.blockHeadersHash,
      fields.blobsHash,
      fields.inHash,
      fields.epochOutHash,
      fields.slotNumber,
      fields.timestamp,
      fields.coinbase,
      fields.feeRecipient,
      fields.gasFees,
      fields.totalManaUsed,
    ] as const;
  }

  static from(fields: FieldsOf<CheckpointHeader>) {
    return new CheckpointHeader(...CheckpointHeader.getFields(fields));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);

    return new CheckpointHeader(
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(Fr),
      SlotNumber(Fr.fromBuffer(reader).toNumber()),
      reader.readUInt64(),
      reader.readObject(EthAddress),
      reader.readObject(AztecAddress),
      reader.readObject(GasFees),
      reader.readObject(Fr),
    );
  }

  equals(other: CheckpointHeader) {
    return (
      this.lastArchiveRoot.equals(other.lastArchiveRoot) &&
      this.blockHeadersHash.equals(other.blockHeadersHash) &&
      this.blobsHash.equals(other.blobsHash) &&
      this.inHash.equals(other.inHash) &&
      this.epochOutHash.equals(other.epochOutHash) &&
      this.slotNumber === other.slotNumber &&
      this.timestamp === other.timestamp &&
      this.coinbase.equals(other.coinbase) &&
      this.feeRecipient.equals(other.feeRecipient) &&
      this.gasFees.equals(other.gasFees) &&
      this.totalManaUsed.equals(other.totalManaUsed)
    );
  }

  /** Returns true if the global variables match those in the checkpoint header. */
  matchesGlobalVariables(other: GlobalVariables) {
    return (
      this.coinbase.equals(other.coinbase) &&
      this.feeRecipient.equals(other.feeRecipient) &&
      this.gasFees.equals(other.gasFees) &&
      this.slotNumber === other.slotNumber &&
      this.timestamp === other.timestamp
    );
  }

  toBuffer() {
    // Note: The order here must match the order in the ProposedHeaderLib solidity library.
    return serializeToBuffer([
      this.lastArchiveRoot,
      this.blockHeadersHash,
      this.blobsHash,
      this.inHash,
      this.epochOutHash,
      new Fr(this.slotNumber),
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

  static empty(fields: Partial<FieldsOf<CheckpointHeader>> = {}) {
    return CheckpointHeader.from({
      lastArchiveRoot: Fr.ZERO,
      blockHeadersHash: Fr.ZERO,
      blobsHash: Fr.ZERO,
      inHash: Fr.ZERO,
      epochOutHash: Fr.ZERO,
      slotNumber: SlotNumber.ZERO,
      timestamp: 0n,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
      totalManaUsed: Fr.ZERO,
      ...fields,
    });
  }

  static random(overrides: Partial<FieldsOf<CheckpointHeader>> = {}): CheckpointHeader {
    return CheckpointHeader.from({
      lastArchiveRoot: Fr.random(),
      blockHeadersHash: Fr.random(),
      blobsHash: Fr.random(),
      inHash: Fr.random(),
      epochOutHash: Fr.random(),
      slotNumber: SlotNumber(Math.floor(Math.random() * 1000) + 1),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      coinbase: EthAddress.random(),
      feeRecipient: new AztecAddress(Fr.random()),
      gasFees: GasFees.random(),
      totalManaUsed: new Fr(BigInt(Math.floor(Math.random() * 1000000))),
      ...overrides,
    });
  }

  isEmpty(): boolean {
    return (
      this.lastArchiveRoot.isZero() &&
      this.blockHeadersHash.isZero() &&
      this.blobsHash.isZero() &&
      this.inHash.isZero() &&
      this.epochOutHash.isZero() &&
      this.slotNumber === 0 &&
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

  static fromString(str: string) {
    return CheckpointHeader.fromBuffer(hexToBuffer(str));
  }

  static fromViem(header: ViemHeader) {
    return new CheckpointHeader(
      Fr.fromString(header.lastArchiveRoot),
      Fr.fromString(header.blockHeadersHash),
      Fr.fromString(header.blobsHash),
      Fr.fromString(header.inHash),
      Fr.fromString(header.outHash),
      SlotNumber.fromBigInt(header.slotNumber),
      header.timestamp,
      new EthAddress(hexToBuffer(header.coinbase)),
      new AztecAddress(hexToBuffer(header.feeRecipient)),
      new GasFees(header.gasFees.feePerDaGas, header.gasFees.feePerL2Gas),
      new Fr(header.totalManaUsed),
    );
  }

  /**
   * Returns the slot number as a SlotNumber branded type.
   * @deprecated Use slotNumber directly instead.
   */
  getSlotNumber(): SlotNumber {
    return this.slotNumber;
  }

  toViem(): ViemHeader {
    return {
      lastArchiveRoot: this.lastArchiveRoot.toString(),
      blockHeadersHash: this.blockHeadersHash.toString(),
      blobsHash: this.blobsHash.toString(),
      inHash: this.inHash.toString(),
      outHash: this.epochOutHash.toString(),
      slotNumber: BigInt(this.slotNumber),
      timestamp: this.timestamp,
      coinbase: this.coinbase.toString(),
      feeRecipient: `0x${this.feeRecipient.toBuffer().toString('hex').padStart(64, '0')}`,
      gasFees: {
        feePerDaGas: this.gasFees.feePerDaGas,
        feePerL2Gas: this.gasFees.feePerL2Gas,
      },
      totalManaUsed: this.totalManaUsed.toBigInt(),
    };
  }

  toInspect() {
    return {
      lastArchive: this.lastArchiveRoot.toString(),
      blockHeadersHash: this.blockHeadersHash.toString(),
      blobsHash: this.blobsHash.toString(),
      inHash: this.inHash.toString(),
      epochOutHash: this.epochOutHash.toString(),
      slotNumber: this.slotNumber,
      timestamp: this.timestamp,
      coinbase: this.coinbase.toString(),
      feeRecipient: this.feeRecipient.toString(),
      gasFees: this.gasFees.toInspect(),
      totalManaUsed: this.totalManaUsed.toBigInt(),
    };
  }

  [inspect.custom]() {
    return `Header {
  lastArchiveRoot: ${this.lastArchiveRoot.toString()},
  blockHeadersHash: ${this.blockHeadersHash.toString()},
  blobsHash: ${inspect(this.blobsHash)},
  inHash: ${inspect(this.inHash)},
  epochOutHash: ${inspect(this.epochOutHash)},
  slotNumber: ${this.slotNumber},
  timestamp: ${this.timestamp},
  coinbase: ${this.coinbase.toString()},
  feeRecipient: ${this.feeRecipient.toString()},
  gasFees: { da:${this.gasFees.feePerDaGas}, l2:${this.gasFees.feePerL2Gas} },
  totalManaUsed: ${this.totalManaUsed.toBigInt()},
}`;
  }
}
