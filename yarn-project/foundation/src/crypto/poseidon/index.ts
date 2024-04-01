import { BarretenbergSync, Fr as FrBarretenberg } from '@aztec/bb.js';

import { Fr } from '../../fields/fields.js';
import { Bufferable, serializeToBufferArray } from '../../serialize/serialize.js';

/**
 * Create a poseidon hash (field) from an array of input fields.
 * Left pads any inputs less than 32 bytes.
 */
export function poseidonHash(input: Bufferable[]): Fr {
  let bufferredInput = serializeToBufferArray(input);
  if (!bufferredInput.every(i => i.length <= 32)) {
    throw new Error('All Pedersen Hash input buffers must be <= 32 bytes.');
  }
  bufferredInput = bufferredInput.map(i => (i.length < 32 ? Buffer.concat([Buffer.alloc(32 - i.length, 0), i]) : i));

  return Fr.fromBuffer(
    Buffer.from(
      BarretenbergSync.getSingleton()
        .poseidonHash(bufferredInput.map(fr => new FrBarretenberg(fr)))
        .toBuffer(),
    ),
  );
}
