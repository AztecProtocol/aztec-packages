import { Signature } from '@aztec/foundation/eth-signature';
import { schemas } from '@aztec/foundation/schemas';
import { L2Block } from '@aztec/stdlib/block';

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
  signatures: Signature[];
};

export const PublishedL2BlockSchema = z.object({
  block: L2Block.schema,
  l1: z.object({
    blockNumber: schemas.BigInt,
    timestamp: schemas.BigInt,
    blockHash: z.string(),
  }),
  signatures: z.array(Signature.schema),
});

export function getAttestationsFromPublishedL2Block(block: PublishedL2Block) {
  const payload = ConsensusPayload.fromBlock(block.block);
  return block.signatures
    .filter(sig => !sig.isEmpty)
    .map(signature => new BlockAttestation(block.block.header.globalVariables.blockNumber, payload, signature));
}
