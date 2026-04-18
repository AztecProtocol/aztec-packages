import { createCheckpointTimingModel, createPipelinedCheckpointTimingModel } from './index.js';

describe('timetable validation', () => {
  it('accepts a non-pipelined multi-block config that fits exactly one block', () => {
    const timing = createCheckpointTimingModel({
      aztecSlotDuration: 34,
      blockDuration: 8,
      checkpointInitializationTime: 1,
      checkpointAssembleTime: 1,
      p2pPropagationTime: 2,
      l1PublishingTime: 12,
      pipelining: false,
    });

    expect(timing.calculateMaxBlocksPerSlot()).toBe(1);
  });

  it('rejects a non-pipelined multi-block config that cannot fit one block', () => {
    expect(() =>
      createCheckpointTimingModel({
        aztecSlotDuration: 33,
        blockDuration: 8,
        checkpointInitializationTime: 1,
        checkpointAssembleTime: 1,
        p2pPropagationTime: 2,
        l1PublishingTime: 12,
        pipelining: false,
      }),
    ).toThrow(/less than one blockDuration/i);
  });

  it('accepts a pipelined multi-block config that fits exactly one block', () => {
    const timing = createPipelinedCheckpointTimingModel({
      aztecSlotDuration: 12,
      blockDuration: 8,
      checkpointInitializationTime: 1,
      checkpointAssembleTime: 1,
      p2pPropagationTime: 2,
      l1PublishingTime: 12,
    });

    expect(timing.calculateMaxBlocksPerSlot()).toBe(1);
  });

  it('rejects a pipelined multi-block config that cannot fit one block', () => {
    expect(() =>
      createPipelinedCheckpointTimingModel({
        aztecSlotDuration: 11,
        blockDuration: 8,
        checkpointInitializationTime: 1,
        checkpointAssembleTime: 1,
        p2pPropagationTime: 2,
        l1PublishingTime: 12,
      }),
    ).toThrow(/less than one blockDuration/i);
  });

  it('allows single-block mode without blockDuration', () => {
    const timing = createCheckpointTimingModel({
      aztecSlotDuration: 10,
      checkpointInitializationTime: 1,
      pipelining: false,
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
