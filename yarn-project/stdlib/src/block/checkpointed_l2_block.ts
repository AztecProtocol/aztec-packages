// Ignoring import issue to fix portable inferred type issue in zod schema
import { CheckpointNumber, CheckpointNumberSchema } from '@aztec/foundation/branded-types';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { L1PublishedData } from '../checkpoint/published_checkpoint.js';
import { MAX_BLOCK_HASH_STRING_LENGTH, MAX_COMMITTEE_SIZE } from '../deserialization/index.js';
import { L2Block } from './l2_block.js';
import { CommitteeAttestation } from './proposal/committee_attestation.js';

/**
 * Encapsulates an L2 Block along with the checkpoint data associated with it.
 */
export class CheckpointedL2Block {
  constructor(
    public checkpointNumber: CheckpointNumber,
    public block: L2Block,
    public l1: L1PublishedData,
    public attestations: CommitteeAttestation[],
  ) {}
  static get schema() {
    return z
      .object({
        checkpointNumber: CheckpointNumberSchema,
        block: L2Block.schema,
        l1: L1PublishedData.schema,
        attestations: z.array(CommitteeAttestation.schema),
      })
      .transform(obj => CheckpointedL2Block.fromFields(obj));
  }

  static fromBuffer(bufferOrReader: Buffer | BufferReader): CheckpointedL2Block {
    const reader = BufferReader.asReader(bufferOrReader);
    const checkpointNumber = reader.readNumber();
    const block = reader.readObject(L2Block);
    const l1BlockNumber = reader.readBigInt();
    const l1BlockHash = reader.readString(MAX_BLOCK_HASH_STRING_LENGTH);
    const l1Timestamp = reader.readBigInt();
    const attestations = reader.readVector(CommitteeAttestation, MAX_COMMITTEE_SIZE);
    return new CheckpointedL2Block(
      CheckpointNumber(checkpointNumber),
      block,
      new L1PublishedData(l1BlockNumber, l1Timestamp, l1BlockHash),
      attestations,
    );
  }

  static fromFields(fields: FieldsOf<CheckpointedL2Block>) {
    return new CheckpointedL2Block(
      CheckpointNumber(fields.checkpointNumber),
      fields.block,
      fields.l1,
      fields.attestations,
    );
  }

  public toBuffer(): Buffer {
    return serializeToBuffer(
      this.checkpointNumber,
      this.block,
      this.l1.blockNumber,
      this.l1.blockHash,
      this.l1.timestamp,
      this.attestations.length,
      this.attestations,
    );
  }
}
