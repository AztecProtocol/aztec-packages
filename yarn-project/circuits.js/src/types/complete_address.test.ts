import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, Point } from '@aztec/foundation/fields';

import { CompleteAddress } from './complete_address.js';

describe('CompleteAddress', () => {
  it('refuses to add an account with incorrect address for given partial address and pubkey', async () => {
    await expect(CompleteAddress.create(AztecAddress.random(), Point.random(), Fr.random())).rejects.toThrowError(
      /cannot be derived/,
    );
  });
});
