import { BlockNumber } from '@aztec/foundation/branded-types';

import { BlockExecutionResult } from './block_execution_result.js';

describe('BlockExecutionResult', () => {
  it('round-trips through buffer serialization', () => {
    const original = new BlockExecutionResult(BlockNumber(123));
    const restored = BlockExecutionResult.fromBuffer(original.toBuffer());
    expect(restored.blockNumber).toEqual(BlockNumber(123));
  });

  it('round-trips through hex string', () => {
    const original = new BlockExecutionResult(BlockNumber(456));
    const restored = BlockExecutionResult.fromString(original.toString());
    expect(restored.blockNumber).toEqual(BlockNumber(456));
  });
});
