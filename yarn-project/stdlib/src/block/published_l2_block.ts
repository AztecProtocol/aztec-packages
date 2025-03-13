import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Signature } from '@aztec/foundation/eth-signature';
import { schemas } from '@aztec/foundation/schemas';
import { L2Block } from '@aztec/stdlib/block';

import { z } from 'zod';

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

export async function randomPublishedL2Block(l2BlockNumber: number): Promise<PublishedL2Block> {
  const block = await L2Block.random(l2BlockNumber);
  const l1 = {
    blockNumber: BigInt(block.number),
    timestamp: block.header.globalVariables.timestamp.toBigInt(),
    blockHash: Buffer32.random().toString(),
  };
  const signatures = times(3, Signature.random);
  return { block, l1, signatures };
}
