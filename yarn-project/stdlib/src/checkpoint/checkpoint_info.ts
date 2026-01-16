import {
  CheckpointNumber,
  CheckpointNumberSchema,
  SlotNumber,
  SlotNumberSchema,
} from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

export type CheckpointInfo = {
  archive: Fr;
  lastArchive: Fr;
  slotNumber: SlotNumber;
  checkpointNumber: CheckpointNumber;
  timestamp: bigint;
};

export function randomCheckpointInfo(checkpointNumber?: CheckpointNumber | number): CheckpointInfo {
  return {
    archive: Fr.random(),
    lastArchive: Fr.random(),
    slotNumber: SlotNumber(Math.floor(Math.random() * 100000) + 1),
    checkpointNumber: CheckpointNumber(checkpointNumber ?? Math.floor(Math.random() * 100000) + 1),
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  };
}

export const CheckpointInfoSchema = z.object({
  archive: schemas.Fr,
  lastArchive: schemas.Fr,
  slotNumber: SlotNumberSchema,
  checkpointNumber: CheckpointNumberSchema,
  timestamp: schemas.BigInt,
});

export function serializeCheckpointInfo(info: CheckpointInfo): Buffer {
  return serializeToBuffer(info.archive, info.lastArchive, info.slotNumber, info.checkpointNumber, info.timestamp);
}

export function deserializeCheckpointInfo(buffer: Buffer | BufferReader): CheckpointInfo {
  const reader = BufferReader.asReader(buffer);
  return {
    archive: reader.readObject(Fr),
    lastArchive: reader.readObject(Fr),
    slotNumber: SlotNumber(reader.readNumber()),
    checkpointNumber: CheckpointNumber(reader.readNumber()),
    timestamp: reader.readBigInt(),
  };
}
