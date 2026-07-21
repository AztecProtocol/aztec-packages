import { keccak256 } from '@aztec/foundation/crypto/keccak';
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
import {
  type CoordinationSignatureContext,
  type CoordinationSignatureType,
  EMPTY_COORDINATION_SIGNATURE_CONTEXT,
  type Signable,
  coordinationSignatureContextEquals,
  coordinationSignatureContextSchema,
  readCoordinationSignatureContext,
  serializeCoordinationSignatureContext,
} from './signature_utils.js';

/** Checkpoint consensus payload as signed by validators and verified on L1. */
export class ConsensusPayload implements Signable {
  readonly primaryType: CoordinationSignatureType = 'CheckpointAttestation';

  private size: number | undefined;

  constructor(
    /** The proposed block header the attestation is made over */
    public readonly header: CheckpointHeader,
    /** The archive root after the block is added */
    public readonly archive: Fr,
    /** The fee asset price modifier in basis points (from oracle) */
    public readonly feeAssetPriceModifier: bigint,
    /** The signing domain (chainId + rollupAddress) the signature is bound to */
    public readonly signatureContext: CoordinationSignatureContext,
  ) {}

  static get schema() {
    return z
      .object({
        header: CheckpointHeader.schema,
        archive: schemas.Fr,
        feeAssetPriceModifier: schemas.BigInt,
        signatureContext: coordinationSignatureContextSchema,
      })
      .transform(obj => new ConsensusPayload(obj.header, obj.archive, obj.feeAssetPriceModifier, obj.signatureContext));
  }

  static getFields(fields: Omit<FieldsOf<ConsensusPayload>, 'primaryType'>) {
    return [fields.header, fields.archive, fields.feeAssetPriceModifier, fields.signatureContext] as const;
  }

  getPayloadToSign(): Buffer {
    // Matches the L1 ProposePayload struct in ProposeLib.sol.
    const abi = parseAbiParameters(
      '(' +
        'bytes32, ' + // archive
        '(int256), ' + // oracleInput
        'bytes32' + // headerHash
        ')',
    );
    const archiveRoot = this.archive.toString();
    const headerHash = this.header.hash().toString();
    const encodedData = encodeAbiParameters(abi, [[archiveRoot, [this.feeAssetPriceModifier], headerHash]] as const);

    return hexToBuffer(encodedData);
  }

  /**
   * Returns a keccak256 hash of the signed payload (header + archive + feeAssetPriceModifier).
   * Used by the attestation pool to dedup distinct signed payloads.
   */
  getPayloadHash(): Buffer {
    return keccak256(this.getPayloadToSign());
  }

  toBuffer(): Buffer {
    return serializeToBuffer([
      this.header,
      this.archive,
      serializeSignedBigInt(this.feeAssetPriceModifier),
      serializeCoordinationSignatureContext(this.signatureContext),
    ]);
  }

  public equals(other: ConsensusPayload | CheckpointProposal | CheckpointProposalCore): boolean {
    const otherHeader = 'checkpointHeader' in other ? other.checkpointHeader : other.header;
    const otherModifier = 'feeAssetPriceModifier' in other ? other.feeAssetPriceModifier : 0n;
    return (
      this.header.equals(otherHeader) &&
      this.archive.equals(other.archive) &&
      this.feeAssetPriceModifier === otherModifier &&
      coordinationSignatureContextEquals(this.signatureContext, other.signatureContext)
    );
  }

  static fromBuffer(buf: Buffer | BufferReader): ConsensusPayload {
    const reader = BufferReader.asReader(buf);
    const header = reader.readObject(CheckpointHeader);
    const archive = reader.readObject(Fr);
    const feeAssetPriceModifier = reader.readInt256();
    const signatureContext = readCoordinationSignatureContext(reader);
    return new ConsensusPayload(header, archive, feeAssetPriceModifier, signatureContext);
  }

  static fromFields(fields: Omit<FieldsOf<ConsensusPayload>, 'primaryType'>): ConsensusPayload {
    return new ConsensusPayload(fields.header, fields.archive, fields.feeAssetPriceModifier, fields.signatureContext);
  }

  static fromCheckpoint(checkpoint: Checkpoint, signatureContext: CoordinationSignatureContext): ConsensusPayload {
    return new ConsensusPayload(
      checkpoint.header,
      checkpoint.archive.root,
      checkpoint.feeAssetPriceModifier,
      signatureContext,
    );
  }

  static empty(): ConsensusPayload {
    return new ConsensusPayload(CheckpointHeader.empty(), Fr.ZERO, 0n, EMPTY_COORDINATION_SIGNATURE_CONTEXT);
  }

  static random(): ConsensusPayload {
    return new ConsensusPayload(CheckpointHeader.random(), Fr.random(), 0n, EMPTY_COORDINATION_SIGNATURE_CONTEXT);
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
      chainId: this.signatureContext.chainId,
      rollupAddress: this.signatureContext.rollupAddress.toString(),
    };
  }

  toString() {
    return `header: ${this.header.toString()}, archive: ${this.archive.toString()}, feeAssetPriceModifier: ${this.feeAssetPriceModifier}, chainId: ${this.signatureContext.chainId}, rollupAddress: ${this.signatureContext.rollupAddress.toString()}`;
  }
}
