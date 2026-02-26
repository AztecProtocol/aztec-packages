// Ignoring import issue to fix portable inferred type issue in zod schema
import { Buffer32 } from '@aztec/foundation/buffer';
import { randomBigInt } from '@aztec/foundation/crypto/random';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { CommitteeAttestation } from '../block/proposal/committee_attestation.js';
import { MAX_BLOCK_HASH_STRING_LENGTH, MAX_COMMITTEE_SIZE } from '../deserialization/index.js';
import { Checkpoint } from './checkpoint.js';

export class L1PublishedData {
  constructor(
    public blockNumber: bigint,
    public timestamp: bigint,
    public blockHash: string,
  ) {}

  static get schema() {
    return z
      .object({
        blockNumber: schemas.BigInt,
        timestamp: schemas.BigInt,
        blockHash: z.string(),
      })
      .transform(obj => L1PublishedData.fromFields(obj));
  }

  static random() {
    return new L1PublishedData(
      randomBigInt(1000n) + 1n,
      BigInt(Math.floor(Date.now() / 1000)),
      Buffer32.random().toString(),
    );
  }

  static fromFields(fields: FieldsOf<L1PublishedData>) {
    return new L1PublishedData(fields.blockNumber, fields.timestamp, fields.blockHash);
  }

  static fromBuffer(bufferOrReader: Buffer | BufferReader): L1PublishedData {
    const reader = BufferReader.asReader(bufferOrReader);
    const l1BlockNumber = reader.readBigInt();
    const l1BlockHash = reader.readString(MAX_BLOCK_HASH_STRING_LENGTH);
    const l1Timestamp = reader.readBigInt();
    return new L1PublishedData(l1BlockNumber, l1Timestamp, l1BlockHash);
  }

  public toBuffer(): Buffer {
    return serializeToBuffer(this.blockNumber, this.blockHash, this.timestamp);
  }
}

export class PublishedCheckpoint {
  constructor(
    /** The checkpoint itself. */
    public checkpoint: Checkpoint,
    /** Info on when this checkpoint was published on L1. */
    public l1: L1PublishedData,
    /** The attestations for the last block in the checkpoint. */
    public attestations: CommitteeAttestation[],
  ) {}

  static get schema() {
    return z
      .object({
        checkpoint: Checkpoint.schema,
        l1: L1PublishedData.schema,
        attestations: z.array(CommitteeAttestation.schema),
      })
      .transform(obj => PublishedCheckpoint.from(obj));
  }

  static getFields(fields: FieldsOf<PublishedCheckpoint>) {
    return [fields.checkpoint, fields.l1, fields.attestations] as const;
  }

  static from(fields: FieldsOf<PublishedCheckpoint>) {
    return new PublishedCheckpoint(...PublishedCheckpoint.getFields(fields));
  }

  static fromBuffer(bufferOrReader: Buffer | BufferReader): PublishedCheckpoint {
    const reader = BufferReader.asReader(bufferOrReader);
    const checkpoint = reader.readObject(Checkpoint);
    const l1BlockNumber = reader.readBigInt();
    const l1BlockHash = reader.readString(MAX_BLOCK_HASH_STRING_LENGTH);
    const l1Timestamp = reader.readBigInt();
    const attestations = reader.readVector(CommitteeAttestation, MAX_COMMITTEE_SIZE);
    return new PublishedCheckpoint(
      checkpoint,
      new L1PublishedData(l1BlockNumber, l1Timestamp, l1BlockHash),
      attestations,
    );
  }

  public toBuffer(): Buffer {
    return serializeToBuffer(
      this.checkpoint,
      this.l1.blockNumber,
      this.l1.blockHash,
      this.l1.timestamp,
      this.attestations.length,
      this.attestations,
    );
  }
}
