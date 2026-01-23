import {
  DEFAULT_ATTESTATION_PROPAGATION_TIME_SECONDS,
  DEFAULT_CHECKPOINT_ASSEMBLE_TIME_SECONDS,
  TEST_CHECKPOINT_ASSEMBLE_TIME_SECONDS,
  TEST_FAST_TIMING_ETHEREUM_SLOT_THRESHOLD_SECONDS,
} from './constants.js';

export * from './constants.js';

/**
 * Returns the amount of time reserved at the end of an Aztec slot (in seconds) for checkpoint finalization.
 */
export function getCheckpointFinalizationTimeSeconds(opts: {
  ethereumSlotDuration: number;
  l1PublishingTime?: number;
  p2pPropagationTime?: number;
}): number {
  const l1PublishingTime = opts.l1PublishingTime ?? opts.ethereumSlotDuration;
  let p2pPropagationTime = opts.p2pPropagationTime ?? DEFAULT_ATTESTATION_PROPAGATION_TIME_SECONDS;
  let checkpointAssembleTime = DEFAULT_CHECKPOINT_ASSEMBLE_TIME_SECONDS;

  // Assume zero-cost propagation and faster runs in test environments where L1 slot duration is shortened
  if (opts.ethereumSlotDuration < TEST_FAST_TIMING_ETHEREUM_SLOT_THRESHOLD_SECONDS) {
    p2pPropagationTime = 0;
    checkpointAssembleTime = TEST_CHECKPOINT_ASSEMBLE_TIME_SECONDS;
  }

  return checkpointAssembleTime + p2pPropagationTime * 2 + l1PublishingTime;
}

/** Convenience helper: checkpoint finalization window in milliseconds. */
export function getCheckpointFinalizationTimeMs(opts: {
  ethereumSlotDuration: number;
  l1PublishingTime?: number;
  p2pPropagationTime?: number;
}): number {
  return Math.ceil(getCheckpointFinalizationTimeSeconds(opts) * 1000);
}
