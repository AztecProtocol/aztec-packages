import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { StaticChildContract } from '@aztec/noir-test-contracts.js/StaticChild';
import { StaticParentContract } from '@aztec/noir-test-contracts.js/StaticParent';

import {
  AUTOMINE_E2E_OPTS,
  STATIC_CALL_STATE_MODIFICATION_ERROR,
  STATIC_CONTEXT_ASSERTION_ERROR,
} from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

// Verifies that static call enforcement prevents state modifications in private and public contexts,
// and that non-static calls to functions marked with static-call assertions are rejected. Uses a single
// node with AutomineSequencer and two contracts (StaticParent, StaticChild).
describe('e2e_static_calls', () => {
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
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));
    sender = owner;
    ({ contract: parentContract } = await StaticParentContract.deploy(wallet).send({ from: owner }));
    ({ contract: childContract } = await StaticChildContract.deploy(wallet).send({ from: owner }));

    // We create a note in the set, such that later reads doesn't fail due to get_notes returning 0 notes
    await childContract.methods.private_set_value(42n, owner, sender).send({ from: owner });
  });

  afterAll(() => teardown());

  // Tests calling StaticChild methods directly: legal reads succeed, illegal state-modifying calls fail.
  describe('direct view calls to child', () => {
    // Calls a read-only private function via a direct send; asserts the tx is mined without error.
    it('performs legal private static calls', async () => {
      await childContract.methods.private_get_value(42n, owner).send({ from: owner });
    });

    // Calls a private function that illegally sets state; asserts STATIC_CALL_STATE_MODIFICATION_ERROR.
    it('fails when performing non-static calls to poorly written static private functions', async () => {
      await expect(childContract.methods.private_illegal_set_value(42n, owner).send({ from: owner })).rejects.toThrow(
        STATIC_CALL_STATE_MODIFICATION_ERROR,
      );
    });

    // Calls a read-only public function; asserts it is mined without error.
    it('performs legal public static calls', async () => {
      await childContract.methods.pub_get_value(42n).send({ from: owner });
    });

    // Simulates a public function that illegally increments state; asserts STATIC_CALL_STATE_MODIFICATION_ERROR.
    it('fails when performing non-static calls to poorly written static public functions', async () => {
      await expect(childContract.methods.pub_illegal_inc_value(42n).simulate({ from: owner })).rejects.toThrow(
        STATIC_CALL_STATE_MODIFICATION_ERROR,
      );
    });
  });

  // Tests StaticParent routing calls to StaticChild: legal static calls succeed, illegal calls (state
  // modification or assertion violations) throw the expected error strings.
  describe('parent calls child', () => {
    // Parent calls child's private read-only function via low-level call and via typed interface; both succeed.
    it('performs legal private to private static calls', async () => {
      // Using low level calls
      await parentContract.methods
        .private_static_call(childContract.address, await childContract.methods.private_get_value.selector(), [
          42n,
          owner,
        ])
        .send({ from: owner });

      // Using the contract interface
      await parentContract.methods
        .private_get_value_from_child(childContract.address, 42n, owner)
        .send({ from: owner });
    });

    // Parent routes through a second level of nesting before calling child's private read; asserts success.
    it('performs legal (nested) private to private static calls', async () => {
      await parentContract.methods
        .private_nested_static_call(childContract.address, await childContract.methods.private_get_value.selector(), [
          42n,
          owner,
        ])
        .send({ from: owner });
    });

    // Parent calls child's public read-only function via low-level and typed interface; both succeed.
    it('performs legal public to public static calls', async () => {
      // Using low level calls
      await parentContract.methods
        .public_static_call(childContract.address, await childContract.methods.pub_get_value.selector(), [42n])
        .send({ from: owner });

      // Using contract interface
      await parentContract.methods.public_get_value_from_child(childContract.address, 42n).send({ from: owner });
    });

    // Parent routes through a second nesting level before calling child's public read; asserts success.
    it('performs legal (nested) public to public static calls', async () => {
      await parentContract.methods
        .public_nested_static_call(childContract.address, await childContract.methods.pub_get_value.selector(), [42n])
        .send({ from: owner });
    });

    // Parent enqueues a static public call to child's read function; asserts both low-level and typed
    // interface variants succeed.
    it('performs legal enqueued public static calls', async () => {
      // Using low level calls
      await parentContract.methods
        .enqueue_static_call_to_pub_function(
          childContract.address,
          await childContract.methods.pub_get_value.selector(),
          [42n],
        )
        .send({ from: owner });

      // Using contract interface
      await parentContract.methods.enqueue_public_get_value_from_child(childContract.address, 42).send({ from: owner });
    });

    // Enqueues a nested static public call through parent → child; asserts the tx succeeds.
    it('performs legal (nested) enqueued public static calls', async () => {
      await parentContract.methods
        .enqueue_static_nested_call_to_pub_function(
          childContract.address,
          await childContract.methods.pub_get_value.selector(),
          [42n],
        )
        .send({ from: owner });
    });

    // Parent makes a private static call to a state-mutating child function; asserts STATIC_CALL_STATE_MODIFICATION_ERROR.
    it('fails when performing illegal private to private static calls', async () => {
      await expect(
        parentContract.methods
          .private_static_call_3_args(childContract.address, await childContract.methods.private_set_value.selector(), [
            42n,
            owner,
            sender,
          ])
          .send({ from: owner }),
      ).rejects.toThrow(STATIC_CALL_STATE_MODIFICATION_ERROR);
    });

    // Parent makes a non-static private call to a function that asserts static context; asserts STATIC_CONTEXT_ASSERTION_ERROR.
    it('fails when performing non-static calls to poorly written private static functions', async () => {
      await expect(
        parentContract.methods
          .private_call(childContract.address, await childContract.methods.private_illegal_set_value.selector(), [
            42n,
            owner,
          ])
          .send({ from: owner }),
      ).rejects.toThrow(STATIC_CONTEXT_ASSERTION_ERROR);
    });

    // Nested private static call from parent to a state-mutating child; asserts STATIC_CALL_STATE_MODIFICATION_ERROR.
    it('fails when performing illegal (nested) private to private static calls', async () => {
      await expect(
        parentContract.methods
          .private_nested_static_call_3_args(
            childContract.address,
            await childContract.methods.private_set_value.selector(),
            [42n, owner, sender],
          )
          .send({ from: owner }),
      ).rejects.toThrow(STATIC_CALL_STATE_MODIFICATION_ERROR);
    });

    // Parent makes a public static call to a state-mutating child function; asserts STATIC_CALL_STATE_MODIFICATION_ERROR.
    it('fails when performing illegal public to public static calls', async () => {
      await expect(
        parentContract.methods
          .public_static_call(childContract.address, await childContract.methods.pub_set_value.selector(), [42n])
          .simulate({ from: owner }),
      ).rejects.toThrow(STATIC_CALL_STATE_MODIFICATION_ERROR);
    });

    // Nested public static call from parent to a state-mutating child; asserts STATIC_CALL_STATE_MODIFICATION_ERROR.
    it('fails when performing illegal (nested) public to public static calls', async () => {
      await expect(
        parentContract.methods
          .public_nested_static_call(childContract.address, await childContract.methods.pub_set_value.selector(), [42n])
          .simulate({ from: owner }),
      ).rejects.toThrow(STATIC_CALL_STATE_MODIFICATION_ERROR);
    });

    // Parent enqueues a static public call to a state-mutating child function; asserts STATIC_CALL_STATE_MODIFICATION_ERROR.
    it('fails when performing illegal enqueued public static calls', async () => {
      await expect(
        parentContract.methods
          .enqueue_static_call_to_pub_function(
            childContract.address,
            await childContract.methods.pub_set_value.selector(),
            [42n],
          )
          .simulate({ from: owner }),
      ).rejects.toThrow(STATIC_CALL_STATE_MODIFICATION_ERROR);
    });

    // Nested enqueued static call to a state-mutating function; asserts STATIC_CALL_STATE_MODIFICATION_ERROR.
    it('fails when performing illegal (nested) enqueued public static calls', async () => {
      await expect(
        parentContract.methods
          .enqueue_static_nested_call_to_pub_function(
            childContract.address,
            await childContract.methods.pub_set_value.selector(),
            [42n],
          )
          .simulate({ from: owner }),
      ).rejects.toThrow(STATIC_CALL_STATE_MODIFICATION_ERROR);
    });

    // Parent enqueues a non-static call to a function that asserts it is called statically; asserts
    // STATIC_CONTEXT_ASSERTION_ERROR.
    it('fails when performing non-static enqueue calls to poorly written public static functions', async () => {
      await expect(
        parentContract.methods
          .enqueue_call(childContract.address, await childContract.methods.pub_illegal_inc_value.selector(), [42n])
          .simulate({ from: owner }),
      ).rejects.toThrow(STATIC_CONTEXT_ASSERTION_ERROR);
    });
  });
});
