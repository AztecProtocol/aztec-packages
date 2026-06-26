import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { ParentContract } from '@aztec/noir-test-contracts.js/Parent';

import { AutomineTestContext } from '../../automine_test_context.js';

// Tests parent contracts enqueuing public calls on a child contract via various call patterns.
// Runs on a single account. Parent and Child are deployed fresh per test in beforeEach.
describe('automine/contracts/nested/manual_private_enqueue', () => {
  const t = new AutomineTestContext();
  let { wallet, parentContract, childContract, defaultAccountAddress, aztecNode } = t;

  const getChildStoredValue = (child: { address: AztecAddress }) =>
    aztecNode.getPublicStorageAt('latest', child.address, new Fr(1));

  beforeAll(async () => {
    // We don't deploy contracts in beforeAll because every test requires a fresh setup
    await t.setup();
    ({ wallet, defaultAccountAddress, aztecNode } = t);
  });

  beforeEach(async () => {
    ({ contract: parentContract } = await ParentContract.deploy(wallet).send({ from: defaultAccountAddress }));
    ({ contract: childContract } = await ChildContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(async () => {
    await t.teardown();
  });

  // Enqueues one pub_inc_value(42) call via the parent and asserts child storage equals 42.
  it('enqueues a single public call', async () => {
    await parentContract.methods
      .enqueue_call_to_child(childContract.address, await childContract.methods.pub_inc_value.selector(), 42n)
      .send({ from: defaultAccountAddress });
    expect(await getChildStoredValue(childContract)).toEqual(new Fr(42n));
  });

  // Enqueues pub_inc_value(42) twice via enqueue_call_to_child_twice and asserts child storage is 85.
  it('enqueues multiple public calls', async () => {
    await parentContract.methods
      .enqueue_call_to_child_twice(childContract.address, await childContract.methods.pub_inc_value.selector(), 42n)
      .send({ from: defaultAccountAddress });
    expect(await getChildStoredValue(childContract)).toEqual(new Fr(85n));
  });

  // Calls enqueue_call_to_pub_entry_point which enqueues pub_entry_point → pub_inc_value; asserts 42.
  it('enqueues a public call with nested public calls', async () => {
    await parentContract.methods
      .enqueue_call_to_pub_entry_point(childContract.address, await childContract.methods.pub_inc_value.selector(), 42n)
      .send({ from: defaultAccountAddress });
    expect(await getChildStoredValue(childContract)).toEqual(new Fr(42n));
  });

  // Calls enqueue_calls_to_pub_entry_point which enqueues pub_entry_point twice; asserts 85.
  it('enqueues multiple public calls with nested public calls', async () => {
    await parentContract.methods
      .enqueue_calls_to_pub_entry_point(
        childContract.address,
        await childContract.methods.pub_inc_value.selector(),
        42n,
      )
      .send({ from: defaultAccountAddress });
    expect(await getChildStoredValue(childContract)).toEqual(new Fr(85n));
  });
});
