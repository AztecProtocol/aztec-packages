import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Signature } from '@aztec/foundation/eth-signature';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { L2Block } from './l2_block.js';
import { CommitteeAttestation } from './proposal/committee_attestation.js';

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

export async function randomPublishedL2Block(l2BlockNumber: number): Promise<PublishedL2Block> {
  const block = await L2Block.random(l2BlockNumber);
  const l1 = {
    blockNumber: BigInt(block.number),
    timestamp: block.header.globalVariables.timestamp.toBigInt(),
    blockHash: Buffer32.random().toString(),
  };
  // Create valid signatures
  const signers = times(3, () => Secp256k1Signer.random());
  const attestations = await Promise.all(
    times(3, async i => {
      const signature: Signature = signers[i].signMessage(Buffer32.fromField(await block.hash()));
      return CommitteeAttestation.fromAddressAndSignature(signers[i].address, signature);
    }),
  );
  return { block, l1, attestations };
}
