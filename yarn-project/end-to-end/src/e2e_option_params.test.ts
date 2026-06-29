import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { MAX_FIELD_VALUE } from '@aztec/constants';
import { OptionParamContract } from '@aztec/noir-test-contracts.js/OptionParam';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 300_000;

const U64_MAX = 2n ** 64n - 1n;
const I64_MIN = -(2n ** 63n);

// Verifies that the Aztec.js ABI layer correctly serialises/deserialises Noir Option<T> parameters
// for public, utility, and private functions. Single node with AutomineSequencer; all calls are
// simulate()-only (no on-chain state changes).
describe('Option params', () => {
  let contract: OptionParamContract;
  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  const someValue = {
    w: MAX_FIELD_VALUE,
    x: true,
    y: U64_MAX,
    z: I64_MIN,
  };

  jest.setTimeout(TIMEOUT);

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));

    contract = (await OptionParamContract.deploy(wallet).send({ from: defaultAccountAddress })).contract;
  });

  afterAll(() => teardown());

  // Simulates a public function accepting Option<Struct> with undefined, null, and a real value,
  // asserting each maps to None / None / Some correctly.
  it('accepts ergonomic Option params for public functions', async () => {
    const { result } = await contract.methods
      .return_public_optional_struct(undefined)
      .simulate({ from: defaultAccountAddress });
    expect(result).toBeUndefined();

    const { result: nullResult } = await contract.methods
      .return_public_optional_struct(null)
      .simulate({ from: defaultAccountAddress });
    expect(nullResult).toBeUndefined();

    const { result: someResult } = await contract.methods
      .return_public_optional_struct(someValue)
      .simulate({ from: defaultAccountAddress });
    expect(someResult).toEqual(someValue);
  });

  // Same Option<Struct> round-trip check for a Noir utility function via simulate().
  it('accepts ergonomic Option params for utility functions', async () => {
    const { result: undefinedResult } = await contract.methods
      .return_utility_optional_struct(undefined)
      .simulate({ from: defaultAccountAddress });
    expect(undefinedResult).toBeUndefined();

    const { result: nullResult } = await contract.methods
      .return_utility_optional_struct(null)
      .simulate({ from: defaultAccountAddress });
    expect(nullResult).toBeUndefined();

    const { result: someResult } = await contract.methods
      .return_utility_optional_struct(someValue)
      .simulate({ from: defaultAccountAddress });
    expect(someResult).toEqual(someValue);
  });

  // Same Option<Struct> round-trip check for a Noir private function via simulate().
  it('accepts ergonomic Option params for private functions', async () => {
    const { result: undefinedResult } = await contract.methods
      .return_private_optional_struct(undefined)
      .simulate({ from: defaultAccountAddress });
    expect(undefinedResult).toBeUndefined();

    const { result: nullResult } = await contract.methods
      .return_private_optional_struct(null)
      .simulate({ from: defaultAccountAddress });
    expect(nullResult).toBeUndefined();

    const { result: someResult } = await contract.methods
      .return_private_optional_struct(someValue)
      .simulate({ from: defaultAccountAddress });
    expect(someResult).toEqual(someValue);
  });
});
