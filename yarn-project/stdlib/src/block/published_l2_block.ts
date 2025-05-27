// Ignoring import issue to fix portable inferred type issue in zod schema
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

export function getAttestationsFromPublishedL2Block(block: PublishedL2Block) {
  const payload = ConsensusPayload.fromBlock(block.block);
  return block.attestations
    .filter(attestation => !attestation.signature.isEmpty())
    .map(
      attestation =>
        new BlockAttestation(block.block.header.globalVariables.blockNumber, payload, attestation.signature),
    );
}
