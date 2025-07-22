// Ignoring import issue to fix portable inferred type issue in zod schema
import { Buffer32 } from '@aztec/foundation/buffer';
import { randomBigInt } from '@aztec/foundation/crypto';
import { schemas } from '@aztec/foundation/schemas';

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
}

export class PublishedL2Block {
  constructor(
    public block: L2Block,
    public l1: L1PublishedData,
    public attestations: CommitteeAttestation[],
  ) {}

  static get schema() {
    return z.object({
      block: L2Block.schema,
      l1: L1PublishedData.schema,
      attestations: z.array(CommitteeAttestation.schema),
    });
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
