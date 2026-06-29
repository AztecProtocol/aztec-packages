import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { ParentContract } from '@aztec/noir-test-contracts.js/Parent';

import { AUTOMINE_E2E_OPTS } from '../fixtures/fixtures.js';
import { NestedContractTest } from './nested_contract_test.js';

// Tests parent contracts enqueuing public calls on a child contract via various call patterns.
// NestedContractTest wraps setup(0, { ...AUTOMINE_E2E_OPTS, fundSponsoredFPC, skipAccountDeployment })
// with 1 public-deployed account. Parent and Child are deployed fresh per test in beforeEach.
describe('e2e_nested_contract manual_enqueue', () => {
  const t = new NestedContractTest('manual_enqueue');
  let { wallet, parentContract, childContract, defaultAccountAddress, aztecNode } = t;

  const getChildStoredValue = (child: { address: AztecAddress }) =>
    aztecNode.getPublicStorageAt('latest', child.address, new Fr(1));

  beforeAll(async () => {
    // We don't deploy contracts in beforeAll because every test requires a fresh setup
    await t.setup({ ...AUTOMINE_E2E_OPTS });
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
