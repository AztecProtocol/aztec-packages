import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { NestedUtilityContract } from '@aztec/noir-test-contracts.js/NestedUtility';
import type { UtilityCallAuthorizationRequest } from '@aztec/pxe/server';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 300_000;

// Verifies nested utility calls via pow_utility(x, n) = x^n (recursive utility→utility),
// calling it from a private function via pow_private, and the default hook behavior.
describe('Nested utility calls', () => {
  let contractA: NestedUtilityContract;
  let contractB: NestedUtilityContract;
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
    ({ contract: contractA } = await NestedUtilityContract.deploy(wallet).send({ from: defaultAccountAddress }));
    ({ contract: contractB } = await NestedUtilityContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  it('pow_utility(x, 0) returns 1 (base case, no nested call)', async () => {
    const { result } = await contractA.methods.pow_utility(2n, 0).simulate({ from: defaultAccountAddress });
    expect(result).toEqual(1n);
  });

  it('pow_utility(2, 10) returns 2^10 (10 levels of nesting)', async () => {
    const { result } = await contractA.methods.pow_utility(2n, 10).simulate({ from: defaultAccountAddress });
    expect(result).toEqual(2n ** 10n);
  });

  it('pow_private(2, 10) returns 2^10 (private function calling utility)', async () => {
    const { result } = await contractA.methods.pow_private(2n, 10).simulate({ from: defaultAccountAddress });
    expect(result).toEqual(2n ** 10n);
  });

  it('denies cross-contract utility call from utility context by default', async () => {
    await expect(
      contractA.methods.delegate_pow_utility(contractB.address, 2n, 3n).simulate({ from: defaultAccountAddress }),
    ).rejects.toThrow('Cross-contract utility call denied');
  });

  it('denies cross-contract utility call from private function by default', async () => {
    await expect(
      contractA.methods.delegate_pow_private(contractB.address, 2n, 3n).simulate({ from: defaultAccountAddress }),
    ).rejects.toThrow('Cross-contract utility call denied');
  });
});

describe('authorizeUtilityCall hook', () => {
  let contractA: NestedUtilityContract;
  let contractB: NestedUtilityContract;
  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;
  jest.setTimeout(TIMEOUT);

  let hookAllows = false;
  let lastRequest: UtilityCallAuthorizationRequest | undefined;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
    } = await setup(1, {
      ...AUTOMINE_E2E_OPTS,
      pxeCreationOptions: {
        hooks: {
          authorizeUtilityCall: (req: UtilityCallAuthorizationRequest) => {
            lastRequest = req;
            return Promise.resolve({ authorized: hookAllows });
          },
        },
      },
    }));

    ({ contract: contractA } = await NestedUtilityContract.deploy(wallet).send({ from: defaultAccountAddress }));
    ({ contract: contractB } = await NestedUtilityContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  beforeEach(() => {
    hookAllows = false;
    lastRequest = undefined;
  });

  it('denies cross-contract utility call from utility context when hook returns false', async () => {
    await expect(
      contractA.methods.delegate_pow_utility(contractB.address, 2n, 3n).simulate({ from: defaultAccountAddress }),
    ).rejects.toThrow('Cross-contract utility call denied');
    expect(lastRequest).toMatchObject({
      caller: contractA.address,
      target: contractB.address,
      functionSelector: await contractB.methods.pow_utility.selector(),
      functionName: 'pow_utility',
      callerContext: 'utility',
    });
  });

  it('allows cross-contract utility call from utility context when hook returns true', async () => {
    hookAllows = true;
    const { result } = await contractA.methods
      .delegate_pow_utility(contractB.address, 2n, 3n)
      .simulate({ from: defaultAccountAddress });
    expect(result).toEqual(8n); // 2^3
    expect(lastRequest).toMatchObject({
      caller: contractA.address,
      target: contractB.address,
      functionSelector: await contractB.methods.pow_utility.selector(),
      functionName: 'pow_utility',
      callerContext: 'utility',
    });
  });

  it('denies cross-contract utility call from private function when hook returns false', async () => {
    await expect(
      contractA.methods.delegate_pow_private(contractB.address, 2n, 3n).simulate({ from: defaultAccountAddress }),
    ).rejects.toThrow('Cross-contract utility call denied');
    expect(lastRequest).toMatchObject({
      caller: contractA.address,
      target: contractB.address,
      functionSelector: await contractB.methods.pow_utility.selector(),
      functionName: 'pow_utility',
      callerContext: 'private',
    });
  });

  it('allows cross-contract utility call from private function when hook returns true', async () => {
    hookAllows = true;
    const { result } = await contractA.methods
      .delegate_pow_private(contractB.address, 2n, 3n)
      .simulate({ from: defaultAccountAddress });
    expect(result).toEqual(8n); // 2^3
    expect(lastRequest).toMatchObject({
      caller: contractA.address,
      target: contractB.address,
      functionSelector: await contractB.methods.pow_utility.selector(),
      functionName: 'pow_utility',
      callerContext: 'private',
    });
  });

  it('syncs target contract notes on cross-contract utility call', async () => {
    hookAllows = true;

    // Store x=2, n=10 as private notes on contract B.
    await contractB.methods.set_pow_args(2n, 10n).send({ from: defaultAccountAddress });

    // Cross-contract call from A → B: B must be synced before the nested utility call
    // so that B's notes (set above) are discovered.
    const { result: crossContractResult } = await contractA.methods
      .delegate_pow_from_storage(contractB.address, defaultAccountAddress)
      .simulate({ from: defaultAccountAddress });
    expect(crossContractResult).toEqual(2n ** 10n);
  });
});
