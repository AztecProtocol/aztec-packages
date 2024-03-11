import { Tuple } from '@aztec/foundation/serialize';

import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, NUM_MSGS_PER_BASE_PARITY } from '../../constants.gen.js';

export class BaseParityInputs {
  constructor(
    /** Aggregated proof of all the parity circuit iterations. */
    public readonly msgs: Tuple<Buffer, typeof NUM_MSGS_PER_BASE_PARITY>,
  ) {
    msgs.forEach((msg: Buffer) => {
      if (msg.length !== 32) {
        throw new Error(`msg buffer must be 32 bytes. Got ${msg.length} bytes`);
      }
    });
  }

  public static fromSlice(
    array: Tuple<Buffer, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>,
    index: number,
  ): BaseParityInputs {
    const start = index * NUM_MSGS_PER_BASE_PARITY;
    const end = start + NUM_MSGS_PER_BASE_PARITY;
    const msgs = array.slice(start, end);
    return new BaseParityInputs(msgs as Tuple<Buffer, typeof NUM_MSGS_PER_BASE_PARITY>);
  }
}
