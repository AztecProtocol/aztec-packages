import {
  CheckpointNumber,
  CheckpointNumberSchema,
  SlotNumber,
  SlotNumberSchema,
} from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

export type CheckpointInfo = {
  /**
   * Archive root after this checkpoint, as raw bytes. Carried as `Buffer32` (not `Fr`) because a checkpoint
   * rejected for an out-of-range archive root has a root that does not fit in the BN254 field; conversion to
   * `Fr` happens only at the ingestion boundary, once the checkpoint is known to be valid and in range.
   */
  archive: Buffer32;
  /** Archive root this checkpoint builds on, as raw bytes (may be out of range for the same reason as `archive`). */
  lastArchive: Buffer32;
  slotNumber: SlotNumber;
  checkpointNumber: CheckpointNumber;
  timestamp: bigint;
};

export function randomCheckpointInfo(checkpointNumber?: CheckpointNumber | number): CheckpointInfo {
  return {
    archive: Buffer32.fromField(Fr.random()),
    lastArchive: Buffer32.fromField(Fr.random()),
    slotNumber: SlotNumber(Math.floor(Math.random() * 100000) + 1),
    checkpointNumber: CheckpointNumber(checkpointNumber ?? Math.floor(Math.random() * 100000) + 1),
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  };
}

export const CheckpointInfoSchema = z.object({
  archive: schemas.Buffer32,
  lastArchive: schemas.Buffer32,
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
    // Archive roots are stored as raw 32 bytes; a rejected checkpoint may carry an out-of-range value.
    archive: Buffer32.fromBuffer(reader.readBytes(32)),
    lastArchive: Buffer32.fromBuffer(reader.readBytes(32)),
    slotNumber: SlotNumber(reader.readNumber()),
    checkpointNumber: CheckpointNumber(reader.readNumber()),
    timestamp: reader.readBigInt(),
  };
}
