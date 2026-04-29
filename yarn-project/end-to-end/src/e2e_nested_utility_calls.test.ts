import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { NestedUtilityContract } from '@aztec/noir-test-contracts.js/NestedUtility';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

// Verifies nested utility calls via pow_utility(x, n) = x^n (recursive utility→utility),
// and calling it from a private function via pow_private.
describe('Nested utility calls', () => {
  let contract: NestedUtilityContract;
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
    } = await setup(1));
    ({ contract } = await NestedUtilityContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  it('pow_utility(x, 0) returns 1 (base case, no nested call)', async () => {
    const { result } = await contract.methods.pow_utility(2n, 0).simulate({ from: defaultAccountAddress });
    expect(result).toEqual(1n);
  });

  it('pow_utility(2, 10) returns 2^10 (10 levels of nesting)', async () => {
    const { result } = await contract.methods.pow_utility(2n, 10).simulate({ from: defaultAccountAddress });
    expect(result).toEqual(2n ** 10n);
  });

  it('pow_private(2, 10) returns 2^10 (private function calling utility)', async () => {
    const { result } = await contract.methods.pow_private(2n, 10).simulate({ from: defaultAccountAddress });
    expect(result).toEqual(2n ** 10n);
  });
});
