import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { MAX_FIELD_VALUE } from '@aztec/constants';
import { OptionParamContract } from '@aztec/noir-test-contracts.js/OptionParam';

import { jest } from '@jest/globals';

import { AutomineTestContext } from '../automine_test_context.js';

const TIMEOUT = 300_000;

const U64_MAX = 2n ** 64n - 1n;
const I64_MIN = -(2n ** 63n);

// Verifies that the Aztec.js ABI layer correctly serialises/deserialises Noir Option<T> parameters
// for public, utility, and private functions. Single node with AutomineSequencer; all calls are
// simulate()-only (no on-chain state changes).
describe('automine/contracts/option_params', () => {
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

  type OptionalStructArg = Parameters<OptionParamContract['methods']['return_public_optional_struct']>[0];

  jest.setTimeout(TIMEOUT);

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);

    contract = (await OptionParamContract.deploy(wallet).send({ from: defaultAccountAddress })).contract;
  });

  afterAll(() => teardown());

  const variants: { kind: string; call: (arg: OptionalStructArg) => ContractFunctionInteraction }[] = [
    { kind: 'public', call: arg => contract.methods.return_public_optional_struct(arg) },
    { kind: 'utility', call: arg => contract.methods.return_utility_optional_struct(arg) },
    { kind: 'private', call: arg => contract.methods.return_private_optional_struct(arg) },
  ];

  // For each function kind, an Option<Struct> param round-trips: undefined and null both map to None,
  // and a real value maps to Some.
  it.each(variants)('accepts ergonomic Option params for $kind functions', async ({ call }) => {
    const { result: undefinedResult } = await call(undefined).simulate({ from: defaultAccountAddress });
    expect(undefinedResult).toBeUndefined();

    const { result: nullResult } = await call(null).simulate({ from: defaultAccountAddress });
    expect(nullResult).toBeUndefined();

    const { result: someResult } = await call(someValue).simulate({ from: defaultAccountAddress });
    expect(someResult).toEqual(someValue);
  });
});
