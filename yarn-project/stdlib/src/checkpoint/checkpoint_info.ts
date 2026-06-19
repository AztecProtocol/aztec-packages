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
   * Archive root after this checkpoint. Carried as `Fr | Buffer32` so a rejected checkpoint with an
   * out-of-range archive root (which cannot be represented as an `Fr`) is still describable (see A-1254).
   */
  archive: Fr | Buffer32;
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
  archive: z.union([schemas.Fr, schemas.Buffer32]),
  lastArchive: schemas.Fr,
  slotNumber: SlotNumberSchema,
  checkpointNumber: CheckpointNumberSchema,
  timestamp: schemas.BigInt,
});

export function serializeCheckpointInfo(info: CheckpointInfo): Buffer {
  // Both Fr and Buffer32 serialize to the same 32 raw big-endian bytes, so the on-disk format is unchanged.
  return serializeToBuffer(info.archive, info.lastArchive, info.slotNumber, info.checkpointNumber, info.timestamp);
}

export function deserializeCheckpointInfo(buffer: Buffer | BufferReader): CheckpointInfo {
  const reader = BufferReader.asReader(buffer);
  return {
    // The archive root may be out of the BN254 field (rejected out-of-range checkpoint), so read the raw 32
    // bytes and only narrow to Fr when in range, falling back to Buffer32 otherwise.
    archive: archiveFromBuffer(reader.readBytes(32)),
    lastArchive: reader.readObject(Fr),
    slotNumber: SlotNumber(reader.readNumber()),
    checkpointNumber: CheckpointNumber(reader.readNumber()),
    timestamp: reader.readBigInt(),
  };
}

/** Narrows a raw 32-byte archive root to `Fr` when it fits in the field, otherwise keeps it as `Buffer32`. */
export function archiveFromBuffer(bytes: Buffer): Fr | Buffer32 {
  return BigInt(`0x${bytes.toString('hex')}`) < Fr.MODULUS ? Fr.fromBuffer(bytes) : Buffer32.fromBuffer(bytes);
}
