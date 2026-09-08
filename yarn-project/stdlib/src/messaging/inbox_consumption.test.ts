import { MAX_L1_TO_L2_MSGS_PER_BLOCK, MAX_L1_TO_L2_MSGS_PER_CHECKPOINT } from '@aztec/constants';

import { describe, expect, it } from '@jest/globals';

import { MIN_BLOCKS_FOR_INBOX_CATCHUP } from './inbox_consumption.js';

describe('inbox_consumption', () => {
  it('needs one block per block-cap of the checkpoint cap to clear a mandatory backlog', () => {
    expect(MIN_BLOCKS_FOR_INBOX_CATCHUP).toBe(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT / MAX_L1_TO_L2_MSGS_PER_BLOCK);
    expect(MIN_BLOCKS_FOR_INBOX_CATCHUP).toBe(4);
  });
});
