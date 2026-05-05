import { SpongeBlob } from '@aztec/blob-lib/types';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import { StateReference } from '../tx/state_reference.js';
import { BlockExecutionResult } from './block_execution_result.js';

describe('BlockExecutionResult', () => {
  it('round-trips through buffer serialization', () => {
    const original = new BlockExecutionResult(
      BlockNumber(123),
      SpongeBlob.empty(),
      StateReference.empty(),
      Fr.ZERO,
      Fr.ZERO,
      [],
    );
    const restored = BlockExecutionResult.fromBuffer(original.toBuffer());
    expect(restored.blockNumber).toEqual(BlockNumber(123));
    expect(restored.txEffects).toEqual([]);
  });

  it('round-trips through hex string', () => {
    const original = new BlockExecutionResult(
      BlockNumber(456),
      SpongeBlob.empty(),
      StateReference.empty(),
      Fr.ZERO,
      Fr.ZERO,
      [],
    );
    const restored = BlockExecutionResult.fromString(original.toString());
    expect(restored.blockNumber).toEqual(BlockNumber(456));
  });
});
