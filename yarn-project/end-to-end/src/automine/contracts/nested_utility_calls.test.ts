import { NO_FROM } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { NestedUtilityContract } from '@aztec/noir-test-contracts.js/NestedUtility';
import type { UtilityCallAuthorizationRequest } from '@aztec/pxe/server';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';

import { jest } from '@jest/globals';

import { AutomineTestContext } from '../automine_test_context.js';

const TIMEOUT = 300_000;

// Verifies nested utility calls via pow_utility(x, n) = x^n (recursive utility→utility),
// calling it from a private function via pow_private, and the default hook behavior.
// Single automine node, one funded account, two NestedUtilityContract instances.
describe('automine/contracts/nested_utility_calls', () => {
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
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);
    ({ contract: contractA } = await NestedUtilityContract.deploy(wallet).send({ from: defaultAccountAddress }));
    ({ contract: contractB } = await NestedUtilityContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  // Simulates pow_utility(2, 0) from the same contract; expects result == 1 with no recursion.
  it('pow_utility with exponent 0 returns 1 - base case, no nested call', async () => {
    const { result } = await contractA.methods.pow_utility(2n, 0).simulate({ from: defaultAccountAddress });
    expect(result).toEqual(1n);
  });

  // Simulates pow_utility(2, 10) which recurses 10 times within the same contract; expects 1024.
  it('pow_utility 2 to the 10 returns 1024 - 10 levels of nesting', async () => {
    const { result } = await contractA.methods.pow_utility(2n, 10).simulate({ from: defaultAccountAddress });
    expect(result).toEqual(2n ** 10n);
  });

  // Simulates pow_private(2, 10) which calls pow_utility from a private function context; expects 1024.
  it('pow_private 2 to the 10 returns 1024 - private function calling utility', async () => {
    const { result } = await contractA.methods.pow_private(2n, 10).simulate({ from: defaultAccountAddress });
    expect(result).toEqual(2n ** 10n);
  });

  // With no authorizeUtilityCall hook registered, a cross-contract utility call is denied by default
  // whether it originates from a utility or a private function.
  it.each([
    {
      context: 'utility context',
      getInteraction: () => contractA.methods.delegate_pow_utility(contractB.address, 2n, 3n),
    },
    {
      context: 'private function',
      getInteraction: () => contractA.methods.delegate_pow_private(contractB.address, 2n, 3n),
    },
  ])('denies cross-contract utility call from $context by default', async ({ getInteraction }) => {
    await expect(getInteraction().simulate({ from: defaultAccountAddress })).rejects.toThrow(
      'Cross-contract utility call denied',
    );
  });

  it('top-level utility has no caller, so its msg_sender is none', async () => {
    // A top-level utility call is not reached via a cross-contract call, so it observes no caller regardless of the
    // `from` supplied for the simulation.
    const withFrom = await contractA.methods.get_msg_sender().simulate({ from: defaultAccountAddress });
    expect(withFrom.result).toBeUndefined();

    const withoutFrom = await contractA.methods.get_msg_sender().simulate({ from: NO_FROM });
    expect(withoutFrom.result).toBeUndefined();
  });
});

// Covers the authorizeUtilityCall PXE hook: verifies that the hook is invoked for cross-contract
// utility calls and that its boolean return controls access. Also tests note sync for the target
// contract before the call. Single automine node with a custom hook registered at setup time.
describe('authorizeUtilityCall hook', () => {
  let contractA: NestedUtilityContract;
  let contractB: NestedUtilityContract;
  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;
  let contractClassId: Fr;
  jest.setTimeout(TIMEOUT);

  let hookAllows = false;
  let lastRequest: UtilityCallAuthorizationRequest | undefined;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
    } = (
      await AutomineTestContext.setup({
        numberOfAccounts: 1,
        pxeCreationOptions: {
          hooks: {
            authorizeUtilityCall: (req: UtilityCallAuthorizationRequest) => {
              lastRequest = req;
              return Promise.resolve({ authorized: hookAllows });
            },
          },
        },
      })
    ).context);

    ({ contract: contractA } = await NestedUtilityContract.deploy(wallet).send({ from: defaultAccountAddress }));
    ({ contract: contractB } = await NestedUtilityContract.deploy(wallet).send({ from: defaultAccountAddress }));
    contractClassId = (await getContractClassFromArtifact(NestedUtilityContract.artifact)).id;
  });

  afterAll(() => teardown());

  beforeEach(() => {
    hookAllows = false;
    lastRequest = undefined;
  });

  const hookRows: {
    context: string;
    callerContext: string;
    allow: boolean;
    getInteraction: () => ContractFunctionInteraction;
  }[] = [
    {
      context: 'utility',
      callerContext: 'utility',
      getInteraction: () => contractA.methods.delegate_pow_utility(contractB.address, 2n, 3n),
    },
    {
      context: 'private function',
      callerContext: 'private',
      getInteraction: () => contractA.methods.delegate_pow_private(contractB.address, 2n, 3n),
    },
    {
      context: 'view function',
      callerContext: 'private view',
      getInteraction: () => contractA.methods.delegate_pow_view(contractB.address, 2n, 3n),
    },
  ].flatMap(row => [
    { ...row, allow: false },
    { ...row, allow: true },
  ]);

  // The hook is consulted for every cross-contract utility call; its boolean return governs access, and
  // the request it receives carries the caller/target class ids, the target selector, and the caller
  // context (utility / private / private view). A denied call throws; an allowed one returns 2^3 = 8.
  it.each(hookRows)(
    '$context context: hook returning $allow governs the cross-contract utility call',
    async ({ getInteraction, callerContext, allow }) => {
      hookAllows = allow;
      if (allow) {
        const { result } = await getInteraction().simulate({ from: defaultAccountAddress });
        expect(result).toEqual(8n);
      } else {
        await expect(getInteraction().simulate({ from: defaultAccountAddress })).rejects.toThrow(
          'Cross-contract utility call denied',
        );
      }
      expect(lastRequest).toMatchObject({
        caller: contractA.address,
        callerClassId: contractClassId,
        target: contractB.address,
        targetClassId: contractClassId,
        functionSelector: await contractB.methods.pow_utility.selector(),
        functionName: 'pow_utility',
        callerContext,
      });
    },
  );

  it('nested utility call sees the calling contract as its msg_sender', async () => {
    hookAllows = true;
    const { result } = await contractA.methods
      .delegate_get_msg_sender(contractB.address)
      .simulate({ from: defaultAccountAddress });
    expect(result).toEqual(contractA.address);
  });

  // Stores pow args as notes on contractB, then calls delegate_pow_from_storage from contractA
  // (cross-contract). Asserts that contractB's notes are synced before the utility call so that
  // the stored values are discoverable.
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
