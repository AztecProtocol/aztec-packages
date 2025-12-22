import type { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr, SlotNumber } from '@aztec/foundation/schemas';

export type CheckpointInfo = {
  archive: Fr;
  slotNumber: SlotNumber;
  checkpointNumber: CheckpointNumber;
  timestamp: bigint;
};
