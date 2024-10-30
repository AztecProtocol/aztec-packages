import { EthAddress } from '@aztec/circuits.js';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';

export class EpochProofQuotePayload {
  // Cached values
  private asBuffer: Buffer | undefined;
  private size: number | undefined;

  constructor(
    public readonly epochToProve: bigint,
    public readonly validUntilSlot: bigint,
    public readonly bondAmount: bigint,
    public readonly prover: EthAddress,
    public readonly basisPointFee: number,
  ) {}

  static getFields(fields: FieldsOf<EpochProofQuotePayload>) {
    return [
      fields.epochToProve,
      fields.validUntilSlot,
      fields.bondAmount,
      fields.prover,
      fields.basisPointFee,
    ] as const;
  }

  toBuffer(): Buffer {
    // We cache the buffer to avoid recalculating it
    if (this.asBuffer) {
      return this.asBuffer;
    }
    this.asBuffer = serializeToBuffer(...EpochProofQuotePayload.getFields(this));
    this.size = this.asBuffer.length;
    return this.asBuffer;
  }

  static fromBuffer(buf: Buffer | BufferReader): EpochProofQuotePayload {
    const reader = BufferReader.asReader(buf);
    return new EpochProofQuotePayload(
      reader.readUInt256(),
      reader.readUInt256(),
      reader.readUInt256(),
      reader.readObject(EthAddress),
      reader.readNumber(),
    );
  }

  static from(fields: FieldsOf<EpochProofQuotePayload>): EpochProofQuotePayload {
    return new EpochProofQuotePayload(
      fields.epochToProve,
      fields.validUntilSlot,
      fields.bondAmount,
      fields.prover,
      fields.basisPointFee,
    );
  }

  toJSON() {
    return {
      epochToProve: this.epochToProve.toString(),
      validUntilSlot: this.validUntilSlot.toString(),
      bondAmount: this.bondAmount.toString(),
      prover: this.prover.toString(),
      basisPointFee: this.basisPointFee,
    };
  }

  static fromJSON(obj: any) {
    return new EpochProofQuotePayload(
      BigInt(obj.epochToProve),
      BigInt(obj.validUntilSlot),
      BigInt(obj.bondAmount),
      EthAddress.fromString(obj.prover),
      obj.basisPointFee,
    );
  }

  toViemArgs(): {
    epochToProve: bigint;
    validUntilSlot: bigint;
    bondAmount: bigint;
    prover: `0x${string}`;
    basisPointFee: number;
  } {
    return {
      epochToProve: this.epochToProve,
      validUntilSlot: this.validUntilSlot,
      bondAmount: this.bondAmount,
      prover: this.prover.toString(),
      basisPointFee: this.basisPointFee,
    };
  }

  getSize(): number {
    // We cache size to avoid recalculating it
    if (this.size) {
      return this.size;
    }
    // Size is cached when calling toBuffer
    this.toBuffer();
    return this.size!;
  }

  [inspect.custom](): string {
    return `EpochProofQuotePayload { epochToProve: ${this.epochToProve}, validUntilSlot: ${this.validUntilSlot}, bondAmount: ${this.bondAmount}, prover: ${this.prover}, basisPointFee: ${this.basisPointFee} }`;
  }
}
