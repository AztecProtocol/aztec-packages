import { BlockNumber, BlockNumberSchema, SlotNumber, SlotNumberSchema } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

export type L2BlockInfo = {
  blockHash?: Fr;
  archive: Fr;
  lastArchive: Fr;
  blockNumber: BlockNumber;
  slotNumber: SlotNumber;
  txCount: number;
  timestamp: bigint;
};

export function randomBlockInfo(blockNumber?: BlockNumber | number): L2BlockInfo {
  return {
    blockHash: Fr.random(),
    archive: Fr.random(),
    lastArchive: Fr.random(),
    blockNumber: BlockNumber(blockNumber ?? Math.floor(Math.random() * 100000) + 1),
    slotNumber: SlotNumber(Math.floor(Math.random() * 100000) + 1),
    txCount: Math.floor(Math.random() * 100),
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  };
}

export const BlockInfoSchema = z.object({
  blockHash: schemas.Fr.optional(),
  archive: schemas.Fr,
  lastArchive: schemas.Fr,
  blockNumber: BlockNumberSchema,
  slotNumber: SlotNumberSchema,
  txCount: z.number(),
  timestamp: schemas.BigInt,
});

export function serializeBlockInfo(blockInfo: L2BlockInfo): Buffer {
  return serializeToBuffer(
    blockInfo.blockHash ?? Fr.ZERO,
    blockInfo.archive,
    blockInfo.lastArchive,
    blockInfo.blockNumber,
    blockInfo.slotNumber,
    blockInfo.txCount,
    blockInfo.timestamp,
  );
}

export function deserializeBlockInfo(buffer: Buffer | BufferReader): L2BlockInfo {
  const reader = BufferReader.asReader(buffer);
  const blockHash = reader.readObject(Fr);
  return {
    blockHash: blockHash.equals(Fr.ZERO) ? undefined : blockHash,
    archive: reader.readObject(Fr),
    lastArchive: reader.readObject(Fr),
    blockNumber: BlockNumber(reader.readNumber()),
    slotNumber: SlotNumber(reader.readNumber()),
    txCount: reader.readNumber(),
    timestamp: reader.readBigInt(),
  };
}
