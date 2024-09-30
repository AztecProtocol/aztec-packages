import { EthAddress } from '@aztec/circuits.js';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { encodeAbiParameters, parseAbiParameters } from 'viem';

import { type Signable } from '../p2p/signature_utils.js';

export class EpochProofQuotePayload implements Signable {
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
    return serializeToBuffer(...EpochProofQuotePayload.getFields(this));
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

  static fromFields(fields: FieldsOf<EpochProofQuotePayload>): EpochProofQuotePayload {
    return new EpochProofQuotePayload(
      fields.epochToProve,
      fields.validUntilSlot,
      fields.bondAmount,
      fields.prover,
      fields.basisPointFee,
    );
  }

  getPayloadToSign(): Buffer {
    const abi = parseAbiParameters('uint256, uint256, uint256, address, uint32');
    const encodedData = encodeAbiParameters(abi, [
      this.epochToProve,
      this.validUntilSlot,
      this.bondAmount,
      this.prover.toString(),
      this.basisPointFee,
    ] as const);

    // NOTE: trim the first two bytes to get rid of the `0x` prefix
    return Buffer.from(encodedData.slice(2), 'hex');
  }
}
