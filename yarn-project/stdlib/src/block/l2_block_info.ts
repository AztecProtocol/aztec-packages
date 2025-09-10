import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

export type L2BlockInfo = {
  blockHash?: Fr;
  archive: Fr;
  lastArchive: Fr;
  blockNumber: number;
  slotNumber: number;
  txCount: number;
  timestamp: bigint;
};

export function randomBlockInfo(blockNumber?: number): L2BlockInfo {
  return {
    blockHash: Fr.random(),
    archive: Fr.random(),
    lastArchive: Fr.random(),
    blockNumber: blockNumber ?? Math.floor(Math.random() * 100000) + 1,
    slotNumber: Math.floor(Math.random() * 100000) + 1,
    txCount: Math.floor(Math.random() * 100),
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  };
}

export const BlockInfoSchema = z.object({
  blockHash: schemas.Fr.optional(),
  archive: schemas.Fr,
  lastArchive: schemas.Fr,
  blockNumber: z.number(),
  slotNumber: z.number(),
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
    blockNumber: reader.readNumber(),
    slotNumber: reader.readNumber(),
    txCount: reader.readNumber(),
    timestamp: reader.readBigInt(),
  };
}
