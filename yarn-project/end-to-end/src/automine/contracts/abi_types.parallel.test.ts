import { FunctionSelector } from '@aztec/aztec.js/abi';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { MAX_FIELD_VALUE } from '@aztec/constants';
import { AbiTypesContract } from '@aztec/noir-test-contracts.js/AbiTypes';

import { jest } from '@jest/globals';

import { AutomineTestContext } from '../automine_test_context.js';

const TIMEOUT = 300_000;

const U64_MAX = 2n ** 64n - 1n;
const I64_MAX = 2n ** 63n - 1n;
const I64_MIN = -(2n ** 63n);

// Tests that different ABI types are correctly encoded when passed to contract functions and decoded from
// return values in TypeScript. Mirrors Noir-side AbiTypes unit tests. Uses setup(1, AUTOMINE_E2E_OPTS)
// providing one node, automine sequencer, and one deployed account.
describe('automine/contracts/abi_types', () => {
  let abiTypesContract: AbiTypesContract;
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);
    ({ contract: abiTypesContract } = await AbiTypesContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  // Simulates return_public_parameters with min and max values for bool, Field, u64, i64, and a nested
  // struct. Asserts that round-tripped values match the TS originals at both extremes.
  it('passes public parameters', async () => {
    const { result: minResult } = await abiTypesContract.methods
      .return_public_parameters(false, 0n, 0n, I64_MIN, { w: 0n, x: false, y: 0n, z: I64_MIN })
      .simulate({ from: defaultAccountAddress });

    expect(minResult).toEqual([false, 0n, 0n, I64_MIN, { w: 0n, x: false, y: 0n, z: I64_MIN }]);

    const { result: maxResult } = await abiTypesContract.methods
      .return_public_parameters(true, MAX_FIELD_VALUE, U64_MAX, I64_MAX, {
        w: MAX_FIELD_VALUE,
        x: true,
        y: U64_MAX,
        z: I64_MAX,
      })
      .simulate({ from: defaultAccountAddress });

    expect(maxResult).toEqual([
      true,
      MAX_FIELD_VALUE,
      U64_MAX,
      I64_MAX,
      { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
    ]);
  });

  // Same as public parameters but via a private function (return_private_parameters).
  it('passes private parameters', async () => {
    const { result: minResult } = await abiTypesContract.methods
      .return_private_parameters(false, 0n, 0n, I64_MIN, { w: 0n, x: false, y: 0n, z: I64_MIN })
      .simulate({ from: defaultAccountAddress });

    expect(minResult).toEqual([false, 0n, 0n, I64_MIN, { w: 0n, x: false, y: 0n, z: I64_MIN }]);

    const { result: maxResult } = await abiTypesContract.methods
      .return_private_parameters(true, MAX_FIELD_VALUE, U64_MAX, I64_MAX, {
        w: MAX_FIELD_VALUE,
        x: true,
        y: U64_MAX,
        z: I64_MAX,
      })
      .simulate({ from: defaultAccountAddress });

    expect(maxResult).toEqual([
      true,
      MAX_FIELD_VALUE,
      U64_MAX,
      I64_MAX,
      { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
    ]);
  });

  // Passes an EthAddress to the contract and asserts the return value is decoded as an EthAddress instance
  // with the same value.
  it('decodes EthAddress return value', async () => {
    const ethAddr = EthAddress.fromString('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');

    const { result } = await abiTypesContract.methods
      .return_eth_address(ethAddr)
      .simulate({ from: defaultAccountAddress });

    expect(result).toBeInstanceOf(EthAddress);
    expect(result).toEqual(ethAddr);
  });

  // Passes a FunctionSelector to the contract and asserts round-trip decoding produces an equal
  // FunctionSelector instance.
  it('decodes FunctionSelector return value', async () => {
    const selector = FunctionSelector.fromField(new Fr(0xdeadbeefn));

    const { result } = await abiTypesContract.methods
      .return_function_selector(selector)
      .simulate({ from: defaultAccountAddress });

    expect(result).toBeInstanceOf(FunctionSelector);
    expect(result).toEqual(selector);
  });

  // Passes a wrapped-field value and asserts the return is decoded as an Fr instance equal to Fr(42).
  it('decodes wrapped field struct as Fr', async () => {
    const value = new Fr(42n);

    const { result } = await abiTypesContract.methods
      .return_wrapped_field(42n)
      .simulate({ from: defaultAccountAddress });

    expect(result).toBeInstanceOf(Fr);
    expect(result).toEqual(value);
  });

  // Same as public/private parameters but via a utility (unconstrained view) function.
  it('passes utility parameters', async () => {
    const { result: minResult } = await abiTypesContract.methods
      .return_utility_parameters(false, 0n, 0n, I64_MIN, { w: 0n, x: false, y: 0n, z: I64_MIN })
      .simulate({ from: defaultAccountAddress });

    expect(minResult).toEqual([false, 0n, 0n, I64_MIN, { w: 0n, x: false, y: 0n, z: I64_MIN }]);

    const { result: maxResult } = await abiTypesContract.methods
      .return_utility_parameters(true, MAX_FIELD_VALUE, U64_MAX, I64_MAX, {
        w: MAX_FIELD_VALUE,
        x: true,
        y: U64_MAX,
        z: I64_MAX,
      })
      .simulate({ from: defaultAccountAddress });

    expect(maxResult).toEqual([
      true,
      MAX_FIELD_VALUE,
      U64_MAX,
      I64_MAX,
      { w: MAX_FIELD_VALUE, x: true, y: U64_MAX, z: I64_MAX },
    ]);
  });
});
