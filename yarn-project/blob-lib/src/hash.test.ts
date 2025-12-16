import { randomBytes } from '@aztec/foundation/crypto';

import { commitmentToFields } from './hash.js';
import { BYTES_PER_COMMITMENT } from './kzg_context.js';

describe('commitment', () => {
  it('converts to fields correctly', () => {
    const commitment = randomBytes(BYTES_PER_COMMITMENT);
    const fields = commitmentToFields(commitment);
    expect(fields.length).toBe(2);
    expect(fields[0].toBuffer()).toEqual(Buffer.concat([Buffer.alloc(1), commitment.subarray(0, 31)]));
    expect(fields[1].toBuffer()).toEqual(Buffer.concat([Buffer.alloc(32 - 17), commitment.subarray(31, 31 + 17)]));
  });
});
