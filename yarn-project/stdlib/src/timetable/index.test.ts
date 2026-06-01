import { createCheckpointTimingModel, createPipelinedCheckpointTimingModel } from './index.js';

describe('timetable validation', () => {
  it('accepts a multi-block config that fits exactly one block', () => {
    // timeReservedAtEnd = assemble(1) + 2*p2p(2) + blockDuration(4) = 9
    // slotDuration(15) - init(1) - reserved(9) = 5 ≥ blockDuration(4)
    const timing = createCheckpointTimingModel({
      aztecSlotDuration: 15,
      blockDuration: 4,
      checkpointInitializationTime: 1,
      checkpointAssembleTime: 1,
      p2pPropagationTime: 2,
      l1PublishingTime: 12,
    });

    expect(timing.calculateMaxBlocksPerSlot()).toBe(1);
  });

  it('rejects a multi-block config that cannot fit one block', () => {
    // timeReservedAtEnd = assemble(1) + 2*p2p(2) + blockDuration(4) = 9
    // slotDuration(13) - init(1) - reserved(9) = 3 < blockDuration(4) → reject
    expect(() =>
      createCheckpointTimingModel({
        aztecSlotDuration: 13,
        blockDuration: 4,
        checkpointInitializationTime: 1,
        checkpointAssembleTime: 1,
        p2pPropagationTime: 2,
        l1PublishingTime: 12,
      }),
    ).toThrow(/less than one blockDuration/i);
  });

  it('accepts a pipelined multi-block config that fits exactly one block', () => {
    // timeReservedAtEnd = assemble(1) + 2*p2p(2) + blockDuration(4) = 9
    // slotDuration(15) - init(1) - reserved(9) = 5 ≥ blockDuration(4)
    const timing = createPipelinedCheckpointTimingModel({
      aztecSlotDuration: 15,
      blockDuration: 4,
      checkpointInitializationTime: 1,
      checkpointAssembleTime: 1,
      p2pPropagationTime: 2,
      l1PublishingTime: 12,
    });

    expect(timing.calculateMaxBlocksPerSlot()).toBe(1);
  });

  it('rejects a pipelined multi-block config that cannot fit one block', () => {
    // timeReservedAtEnd = assemble(1) + 2*p2p(2) + blockDuration(4) = 9
    // slotDuration(13) - init(1) - reserved(9) = 3 < blockDuration(4) → reject
    expect(() =>
      createPipelinedCheckpointTimingModel({
        aztecSlotDuration: 13,
        blockDuration: 4,
        checkpointInitializationTime: 1,
        checkpointAssembleTime: 1,
        p2pPropagationTime: 2,
        l1PublishingTime: 12,
      }),
    ).toThrow(/less than one blockDuration/i);
  });

  it('computes pipelined timing for the default 72s/6s config', () => {
    const timing = createPipelinedCheckpointTimingModel({
      aztecSlotDuration: 72,
      blockDuration: 6,
      checkpointInitializationTime: 1,
      checkpointAssembleTime: 1,
      p2pPropagationTime: 2,
      l1PublishingTime: 12,
    });

    // timeReservedAtEnd = 1 + 2*2 + 6 = 11s
    expect(timing.timeReservedAtEnd).toBe(11);
    // available = 72 - 1 - 11 = 60s → floor(60/6) = 10 blocks
    expect(timing.calculateMaxBlocksPerSlot()).toBe(10);
    // Grace period is zero under early pipelining
    expect(timing.pipeliningAttestationGracePeriod).toBe(0);
    // Proposals no longer spill into the target slot
    expect(timing.proposalWindowIntoTargetSlot).toBe(0);
    // Attestation straggler grace is bounded by round-trip p2p
    expect(timing.attestationWindowIntoTargetSlot).toBe(4);
    // Assembly deadline sits at slot boundary
    expect(timing.checkpointAssemblyDeadline).toBe(72);
  });

  it('allows single-block mode without blockDuration', () => {
    const timing = createCheckpointTimingModel({
      aztecSlotDuration: 10,
      checkpointInitializationTime: 1,
    });

    expect(timing.calculateMaxBlocksPerSlot()).toBe(1);
  });

  it('uses compressed timing allowances for short ethereum test slots', () => {
    const timing = createCheckpointTimingModel({
      aztecSlotDuration: 24,
      ethereumSlotDuration: 4,
      blockDuration: 8,
      l1PublishingTime: 2,
      p2pPropagationTime: 0.5,
    });

    expect(timing.calculateMaxBlocksPerSlot()).toBe(1);
  });
});
