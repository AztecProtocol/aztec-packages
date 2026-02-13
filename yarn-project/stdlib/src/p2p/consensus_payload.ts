import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeSignedBigInt, serializeToBuffer } from '@aztec/foundation/serialize';
import { hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { z } from 'zod';

import type { Checkpoint } from '../checkpoint/checkpoint.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import type { CheckpointProposal, CheckpointProposalCore } from './checkpoint_proposal.js';
import type { Signable, SignatureDomainSeparator } from './signature_utils.js';

/** Checkpoint consensus payload as signed by validators and verified on L1. */
export class ConsensusPayload implements Signable {
  private size: number | undefined;

  constructor(
    /** The proposed block header the attestation is made over */
    public readonly header: CheckpointHeader,
    /** The archive root after the block is added */
    public readonly archive: Fr,
    /** The fee asset price modifier in basis points (from oracle) */
    public readonly feeAssetPriceModifier: bigint = 0n,
  ) {}

  static get schema() {
    return z
      .object({
        header: CheckpointHeader.schema,
        archive: schemas.Fr,
        feeAssetPriceModifier: schemas.BigInt,
      })
      .transform(obj => new ConsensusPayload(obj.header, obj.archive, obj.feeAssetPriceModifier));
  }

  static getFields(fields: FieldsOf<ConsensusPayload>) {
    return [fields.header, fields.archive, fields.feeAssetPriceModifier] as const;
  }

  getPayloadToSign(domainSeparator: SignatureDomainSeparator): Buffer {
    const abi = parseAbiParameters(
      'uint8, ' + //domainSeperator
        '(' +
        'bytes32, ' + // archive
        '(int256), ' + // oracleInput
        'bytes32' + // headerHash
        ')',
    );
    const archiveRoot = this.archive.toString();

    const headerHash = this.header.hash().toString();
    const encodedData = encodeAbiParameters(abi, [
      domainSeparator,
      [archiveRoot, [this.feeAssetPriceModifier], headerHash],
    ] as const);

    return hexToBuffer(encodedData);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.header, this.archive, serializeSignedBigInt(this.feeAssetPriceModifier)]);
  }

  public equals(other: ConsensusPayload | CheckpointProposal | CheckpointProposalCore): boolean {
    const otherHeader = 'checkpointHeader' in other ? other.checkpointHeader : other.header;
    const otherModifier = 'feeAssetPriceModifier' in other ? other.feeAssetPriceModifier : 0n;
    return (
      this.header.equals(otherHeader) &&
      this.archive.equals(other.archive) &&
      this.feeAssetPriceModifier === otherModifier
    );
  }

  static fromBuffer(buf: Buffer | BufferReader): ConsensusPayload {
    const reader = BufferReader.asReader(buf);
    const payload = new ConsensusPayload(
      reader.readObject(CheckpointHeader),
      reader.readObject(Fr),
      reader.readInt256(),
    );
    return payload;
  }

  static fromFields(fields: FieldsOf<ConsensusPayload>): ConsensusPayload {
    return new ConsensusPayload(fields.header, fields.archive, fields.feeAssetPriceModifier);
  }

  static fromCheckpoint(checkpoint: Checkpoint): ConsensusPayload {
    return new ConsensusPayload(checkpoint.header, checkpoint.archive.root, checkpoint.feeAssetPriceModifier);
  }

  static empty(): ConsensusPayload {
    return new ConsensusPayload(CheckpointHeader.empty(), Fr.ZERO, 0n);
  }

  static random(): ConsensusPayload {
    return new ConsensusPayload(CheckpointHeader.random(), Fr.random(), 0n);
  }

  /**
   * Get the size of the consensus payload in bytes.
   * @returns The size of the consensus payload.
   */
  getSize(): number {
    // We cache size to avoid recalculating it
    if (this.size) {
      return this.size;
    }
    this.size = this.toBuffer().length;
    return this.size;
  }

  toInspect() {
    return {
      header: this.header.toInspect(),
      archive: this.archive.toString(),
      feeAssetPriceModifier: this.feeAssetPriceModifier.toString(),
    };
  }

  toString() {
    return `header: ${this.header.toString()}, archive: ${this.archive.toString()}, feeAssetPriceModifier: ${this.feeAssetPriceModifier}}`;
  }
}
