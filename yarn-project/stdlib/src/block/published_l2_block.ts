// Ignoring import issue to fix portable inferred type issue in zod schema
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { L1PublishedData, PublishedCheckpoint } from '../checkpoint/published_checkpoint.js';
import { L2Block } from './l2_block.js';
import { CommitteeAttestation } from './proposal/committee_attestation.js';

/**
 * @deprecated `PublishedCheckpoint` is what will be retrieved from L1.
 * L2 blocks do not need to link to L1PublishedData directly.
 * TODO: Create another type (AttestedL2Block?) for an L2 block and its attestations.
 */
export class PublishedL2Block {
  constructor(
    public block: L2Block,
    public l1: L1PublishedData,
    public attestations: CommitteeAttestation[],
  ) {}

  static get schema() {
    return z
      .object({
        block: L2Block.schema,
        l1: L1PublishedData.schema,
        attestations: z.array(CommitteeAttestation.schema),
      })
      .transform(obj => PublishedL2Block.fromFields(obj));
  }

  static fromBuffer(bufferOrReader: Buffer | BufferReader): PublishedL2Block {
    const reader = BufferReader.asReader(bufferOrReader);
    const block = reader.readObject(L2Block);
    const l1BlockNumber = reader.readBigInt();
    const l1BlockHash = reader.readString();
    const l1Timestamp = reader.readBigInt();
    const attestations = reader.readVector(CommitteeAttestation);
    return new PublishedL2Block(block, new L1PublishedData(l1BlockNumber, l1Timestamp, l1BlockHash), attestations);
  }

  static fromFields(fields: FieldsOf<PublishedL2Block>) {
    return new PublishedL2Block(fields.block, fields.l1, fields.attestations);
  }

  public toBuffer(): Buffer {
    return serializeToBuffer(
      this.block,
      this.l1.blockNumber,
      this.l1.blockHash,
      this.l1.timestamp,
      this.attestations.length,
      this.attestations,
    );
  }

  public toPublishedCheckpoint() {
    return new PublishedCheckpoint(this.block.toCheckpoint(), this.l1, this.attestations);
  }

  static fromPublishedCheckpoint(checkpoint: PublishedCheckpoint) {
    return new PublishedL2Block(L2Block.fromCheckpoint(checkpoint.checkpoint), checkpoint.l1, checkpoint.attestations);
  }
}
