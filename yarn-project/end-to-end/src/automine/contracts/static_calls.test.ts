import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { StaticChildContract } from '@aztec/noir-test-contracts.js/StaticChild';
import { StaticParentContract } from '@aztec/noir-test-contracts.js/StaticParent';

import { STATIC_CALL_STATE_MODIFICATION_ERROR, STATIC_CONTEXT_ASSERTION_ERROR } from '../../fixtures/fixtures.js';
import { AutomineTestContext } from '../automine_test_context.js';

// Verifies that static call enforcement prevents state modifications in private and public contexts,
// and that non-static calls to functions marked with static-call assertions are rejected. Uses a single
// node with AutomineSequencer and two contracts (StaticParent, StaticChild).
describe('automine/contracts/static_calls', () => {
  let wallet: Wallet;
  let parentContract: StaticParentContract;
  let childContract: StaticChildContract;
  let teardown: () => Promise<void>;
  let owner: AztecAddress;
  let sender: AztecAddress;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [owner],
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);
    sender = owner;
    ({ contract: parentContract } = await StaticParentContract.deploy(wallet).send({ from: owner }));
    ({ contract: childContract } = await StaticChildContract.deploy(wallet).send({ from: owner }));

    // We create a note in the set, such that later reads doesn't fail due to get_notes returning 0 notes
    await childContract.methods.private_set_value(42n, owner, sender).send({ from: owner });
  });

  afterAll(() => teardown());

  // A single static-call scenario: one or more interactions that must all either succeed or be rejected
  // with `error`. `mode` picks whether each interaction is submitted (`send`) or only simulated.
  type StaticCallCase = {
    description: string;
    getInteractions: () => ContractFunctionInteraction[] | Promise<ContractFunctionInteraction[]>;
    mode: 'send' | 'simulate';
    /** Expected thrown-error matcher; undefined means the interactions must succeed. */
    error?: string | RegExp;
  };

  const runStaticCallCase = async ({ getInteractions, mode, error }: StaticCallCase) => {
    for (const interaction of await getInteractions()) {
      const run = mode === 'send' ? interaction.send({ from: owner }) : interaction.simulate({ from: owner });
      if (error !== undefined) {
        await expect(run).rejects.toThrow(error);
      } else {
        await run;
      }
    }
  };

  // Calling StaticChild methods directly: legal reads succeed, illegal state-modifying calls fail.
  describe('direct view calls to child', () => {
    const cases: StaticCallCase[] = [
      {
        description: 'performs legal private static calls',
        getInteractions: () => [childContract.methods.private_get_value(42n, owner)],
        mode: 'send',
      },
      {
        description: 'fails when performing non-static calls to poorly written static private functions',
        getInteractions: () => [childContract.methods.private_illegal_set_value(42n, owner)],
        mode: 'send',
        error: STATIC_CALL_STATE_MODIFICATION_ERROR,
      },
      {
        description: 'performs legal public static calls',
        getInteractions: () => [childContract.methods.pub_get_value(42n)],
        mode: 'send',
      },
      {
        description: 'fails when performing non-static calls to poorly written static public functions',
        getInteractions: () => [childContract.methods.pub_illegal_inc_value(42n)],
        mode: 'simulate',
        error: STATIC_CALL_STATE_MODIFICATION_ERROR,
      },
    ];

    it.each(cases)('$description', testCase => runStaticCallCase(testCase));
  });

  // StaticParent routing calls to StaticChild: legal static calls succeed, illegal calls (state
  // modification or assertion violations) throw the expected error strings. Legal cases that list two
  // interactions cover both the low-level call and the typed contract interface.
  describe('parent calls child', () => {
    const cases: StaticCallCase[] = [
      {
        description: 'performs legal private to private static calls',
        getInteractions: async () => [
          parentContract.methods.private_static_call(
            childContract.address,
            await childContract.methods.private_get_value.selector(),
            [42n, owner],
          ),
          parentContract.methods.private_get_value_from_child(childContract.address, 42n, owner),
        ],
        mode: 'send',
      },
      {
        description: 'performs legal (nested) private to private static calls',
        getInteractions: async () => [
          parentContract.methods.private_nested_static_call(
            childContract.address,
            await childContract.methods.private_get_value.selector(),
            [42n, owner],
          ),
        ],
        mode: 'send',
      },
      {
        description: 'performs legal public to public static calls',
        getInteractions: async () => [
          parentContract.methods.public_static_call(
            childContract.address,
            await childContract.methods.pub_get_value.selector(),
            [42n],
          ),
          parentContract.methods.public_get_value_from_child(childContract.address, 42n),
        ],
        mode: 'send',
      },
      {
        description: 'performs legal (nested) public to public static calls',
        getInteractions: async () => [
          parentContract.methods.public_nested_static_call(
            childContract.address,
            await childContract.methods.pub_get_value.selector(),
            [42n],
          ),
        ],
        mode: 'send',
      },
      {
        description: 'performs legal enqueued public static calls',
        getInteractions: async () => [
          parentContract.methods.enqueue_static_call_to_pub_function(
            childContract.address,
            await childContract.methods.pub_get_value.selector(),
            [42n],
          ),
          parentContract.methods.enqueue_public_get_value_from_child(childContract.address, 42),
        ],
        mode: 'send',
      },
      {
        description: 'performs legal (nested) enqueued public static calls',
        getInteractions: async () => [
          parentContract.methods.enqueue_static_nested_call_to_pub_function(
            childContract.address,
            await childContract.methods.pub_get_value.selector(),
            [42n],
          ),
        ],
        mode: 'send',
      },
      {
        description: 'fails when performing illegal private to private static calls',
        getInteractions: async () => [
          parentContract.methods.private_static_call_3_args(
            childContract.address,
            await childContract.methods.private_set_value.selector(),
            [42n, owner, sender],
          ),
        ],
        mode: 'send',
        error: STATIC_CALL_STATE_MODIFICATION_ERROR,
      },
      {
        description: 'fails when performing non-static calls to poorly written private static functions',
        getInteractions: async () => [
          parentContract.methods.private_call(
            childContract.address,
            await childContract.methods.private_illegal_set_value.selector(),
            [42n, owner],
          ),
        ],
        mode: 'send',
        error: STATIC_CONTEXT_ASSERTION_ERROR,
      },
      {
        description: 'fails when performing illegal (nested) private to private static calls',
        getInteractions: async () => [
          parentContract.methods.private_nested_static_call_3_args(
            childContract.address,
            await childContract.methods.private_set_value.selector(),
            [42n, owner, sender],
          ),
        ],
        mode: 'send',
        error: STATIC_CALL_STATE_MODIFICATION_ERROR,
      },
      {
        description: 'fails when performing illegal public to public static calls',
        getInteractions: async () => [
          parentContract.methods.public_static_call(
            childContract.address,
            await childContract.methods.pub_set_value.selector(),
            [42n],
          ),
        ],
        mode: 'simulate',
        error: STATIC_CALL_STATE_MODIFICATION_ERROR,
      },
      {
        description: 'fails when performing illegal (nested) public to public static calls',
        getInteractions: async () => [
          parentContract.methods.public_nested_static_call(
            childContract.address,
            await childContract.methods.pub_set_value.selector(),
            [42n],
          ),
        ],
        mode: 'simulate',
        error: STATIC_CALL_STATE_MODIFICATION_ERROR,
      },
      {
        description: 'fails when performing illegal enqueued public static calls',
        getInteractions: async () => [
          parentContract.methods.enqueue_static_call_to_pub_function(
            childContract.address,
            await childContract.methods.pub_set_value.selector(),
            [42n],
          ),
        ],
        mode: 'simulate',
        error: STATIC_CALL_STATE_MODIFICATION_ERROR,
      },
      {
        description: 'fails when performing illegal (nested) enqueued public static calls',
        getInteractions: async () => [
          parentContract.methods.enqueue_static_nested_call_to_pub_function(
            childContract.address,
            await childContract.methods.pub_set_value.selector(),
            [42n],
          ),
        ],
        mode: 'simulate',
        error: STATIC_CALL_STATE_MODIFICATION_ERROR,
      },
      {
        description: 'fails when performing non-static enqueue calls to poorly written public static functions',
        getInteractions: async () => [
          parentContract.methods.enqueue_call(
            childContract.address,
            await childContract.methods.pub_illegal_inc_value.selector(),
            [42n],
          ),
        ],
        mode: 'simulate',
        error: STATIC_CONTEXT_ASSERTION_ERROR,
      },
    ];

    it.each(cases)('$description', testCase => runStaticCallCase(testCase));
  });
});
