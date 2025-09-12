// Ignoring import issue to fix portable inferred type issue in zod schema
import { Buffer32 } from '@aztec/foundation/buffer';
import { randomBigInt } from '@aztec/foundation/crypto';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { BlockAttestation } from '../p2p/block_attestation.js';
import { ConsensusPayload } from '../p2p/consensus_payload.js';
import { L2Block } from './l2_block.js';
import { CommitteeAttestation } from './proposal/committee_attestation.js';

export class L1PublishedData {
  constructor(
    public blockNumber: bigint,
    public timestamp: bigint,
    public blockHash: string,
  ) {}

  static get schema() {
    return z.object({
      blockNumber: schemas.BigInt,
      timestamp: schemas.BigInt,
      blockHash: z.string(),
    });
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
}

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
}

export function getAttestationsFromPublishedL2Block(
  block: Pick<PublishedL2Block, 'attestations' | 'block'>,
): BlockAttestation[] {
  const payload = ConsensusPayload.fromBlock(block.block);
  return block.attestations
    .filter(attestation => !attestation.signature.isEmpty())
    .map(attestation => new BlockAttestation(block.block.number, payload, attestation.signature));
}
