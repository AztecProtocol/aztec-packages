import { FunctionSelector } from '@aztec/aztec.js/abi';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { MAX_FIELD_VALUE } from '@aztec/constants';
import { AbiTypesContract } from '@aztec/noir-test-contracts.js/AbiTypes';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 300_000;

const U64_MAX = 2n ** 64n - 1n;
const I64_MAX = 2n ** 63n - 1n;
const I64_MIN = -(2n ** 63n);

// Tests that different types are supported to be passed to contract functions and received as return values. This
// mirrors the Noir tests for the AbiTypes contract to make sure that these values can also be passed from TS.
describe('AbiTypes', () => {
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
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));
    ({ contract: abiTypesContract } = await AbiTypesContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

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

  it('decodes EthAddress return value', async () => {
    const ethAddr = EthAddress.fromString('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');

    const { result } = await abiTypesContract.methods
      .return_eth_address(ethAddr)
      .simulate({ from: defaultAccountAddress });

    expect(result).toBeInstanceOf(EthAddress);
    expect(result).toEqual(ethAddr);
  });

  it('decodes FunctionSelector return value', async () => {
    const selector = FunctionSelector.fromField(new Fr(0xdeadbeefn));

    const { result } = await abiTypesContract.methods
      .return_function_selector(selector)
      .simulate({ from: defaultAccountAddress });

    expect(result).toBeInstanceOf(FunctionSelector);
    expect(result).toEqual(selector);
  });

  it('decodes wrapped field struct as Fr', async () => {
    const value = new Fr(42n);

    const { result } = await abiTypesContract.methods
      .return_wrapped_field(42n)
      .simulate({ from: defaultAccountAddress });

    expect(result).toBeInstanceOf(Fr);
    expect(result).toEqual(value);
  });

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
