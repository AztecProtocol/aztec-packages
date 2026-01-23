/**
 * Shared timing defaults used by the sequencer timetable and validator/p2p deadline cutoffs.
 *
 * Keep these in stdlib so components can agree on timing without importing sequencer-client
 * (which would create dependency cycles).
 */

/** Default one-way p2p propagation time (seconds). */
export const DEFAULT_ATTESTATION_PROPAGATION_TIME_SECONDS = 2;

/** Default time spent assembling a checkpoint after building the last block (seconds). */
export const DEFAULT_CHECKPOINT_ASSEMBLE_TIME_SECONDS = 1;

/**
 * In test environments we often shorten the L1 slot duration; the sequencer timetable assumes
 * faster propagation/assembly in that case. This threshold matches that behavior.
 */
export const TEST_FAST_TIMING_ETHEREUM_SLOT_THRESHOLD_SECONDS = 8;

/** Checkpoint assembly time (seconds) when running with shortened L1 slots (test mode). */
export const TEST_CHECKPOINT_ASSEMBLE_TIME_SECONDS = 0.5;
