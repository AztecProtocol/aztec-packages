// Ignoring import issue to fix portable inferred type issue in zod schema
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Signature } from '@aztec/foundation/eth-signature';
import { schemas } from '@aztec/foundation/schemas';
import { CommitteeAttestation, L2Block } from '@aztec/stdlib/block';

import { z } from 'zod';

import { BlockAttestation } from '../p2p/block_attestation.js';
import { ConsensusPayload } from '../p2p/consensus_payload.js';

export type L1PublishedData = {
  blockNumber: bigint;
  timestamp: bigint;
  blockHash: string;
};

export type PublishedL2Block = {
  block: L2Block;
  l1: L1PublishedData;
  attestations: CommitteeAttestation[];
};

export const PublishedL2BlockSchema = z.object({
  block: L2Block.schema,
  l1: z.object({
    blockNumber: schemas.BigInt,
    timestamp: schemas.BigInt,
    blockHash: z.string(),
  }),
  attestations: z.array(CommitteeAttestation.schema),
});

export function getAttestationsFromPublishedL2Block(block: PublishedL2Block) {
  const payload = ConsensusPayload.fromBlock(block.block);
  return block.attestations
    .filter(attestation => !attestation.signature.isEmpty())
    .map(
      attestation =>
        new BlockAttestation(block.block.header.globalVariables.blockNumber, payload, attestation.signature),
    );
}
