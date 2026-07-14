import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { serializeToBuffer } from '@aztec/foundation/serialize';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';

import { AutomineTestContext } from '../../automine_test_context.js';

// Nested contract calls between Parent and Child. A single account runs a shared Parent/Child deployed in
// beforeAll via applyManualParentChild(); the public and enqueued-call suites redeploy a fresh Child per
// test because each asserts an absolute child storage value that only holds if the child starts at zero.
describe('automine/contracts/nested/manual_calls', () => {
  const t = new AutomineTestContext();
  let { wallet, parentContract, childContract, defaultAccountAddress, aztecNode } = t;

  const getChildStoredValue = (child: { address: AztecAddress }) =>
    aztecNode.getPublicStorageAt('latest', child.address, new Fr(1));

  beforeAll(async () => {
    await t.setup();
    await t.applyManualParentChild();
    ({ wallet, parentContract, childContract, defaultAccountAddress, aztecNode } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  describe('private calls', () => {
    // Routes a private call through the parent into child.value(0). Asserts the nested call returns the
    // same preimage as calling child.value(0) directly, and that the tx is included on-chain.
    it('performs a nested private call returning the child value', async () => {
      const selector = await childContract.methods.value.selector();

      const { result } = await parentContract.methods
        .entry_point(childContract.address, selector)
        .simulate({ from: defaultAccountAddress });
      const { result: direct } = await childContract.methods.value(0n).simulate({ from: defaultAccountAddress });
      expect(result).toEqual(direct);

      await parentContract.methods.entry_point(childContract.address, selector).send({ from: defaultAccountAddress });
    });
  });

  describe('public calls', () => {
    let child: ChildContract;

    beforeEach(async () => {
      ({ contract: child } = await ChildContract.deploy(wallet).send({ from: defaultAccountAddress }));
    });

    // Routes a public call through the parent into child.pub_inc_value(42); asserts the child's storage
    // slot holds 42 afterwards, confirming the nested public call executed and wrote state.
    it('performs public nested calls', async () => {
      await parentContract.methods
        .pub_entry_point(child.address, await child.methods.pub_inc_value.selector(), 42n)
        .send({ from: defaultAccountAddress });
      expect(await getChildStoredValue(child)).toEqual(new Fr(42n));
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/640
    // Calls pub_entry_point_twice so pub_inc_value runs twice in one tx; asserts storage is 84 (not 42).
    it('reads fresh value after write within the same tx', async () => {
      await parentContract.methods
        .pub_entry_point_twice(child.address, await child.methods.pub_inc_value.selector(), 42n)
        .send({ from: defaultAccountAddress });
      expect(await getChildStoredValue(child)).toEqual(new Fr(84n));
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/1645
    // Executes a public call first and then a private call (which enqueues another public call)
    // through the account contract, if the account entrypoint behaves properly, it will honor
    // this order and not run the private call first which results in the public calls being inverted.
    // Batches pub_set_value(20) and parent.enqueue(pub_set_value(40)); reads public logs to assert [20, 40].
    it('executes public calls in expected order', async () => {
      const pubSetValueSelector = await child.methods.pub_set_value.selector();
      const actions = [
        child.methods.pub_set_value(20n),
        parentContract.methods.enqueue_call_to_child(child.address, pubSetValueSelector, 40n),
      ];

      const { receipt: tx } = await new BatchCall(wallet, actions).send({ from: defaultAccountAddress });
      const block = (await aztecNode.getBlock({ number: tx.blockNumber! }, { includeTransactions: true }))!;
      const allPublicLogs = block.body.txEffects.flatMap(effect => effect.publicLogs);
      const processedLogs = allPublicLogs.map(log => toBigIntBE(serializeToBuffer(log.getEmittedFields())));
      expect(processedLogs).toEqual([20n, 40n]);
      expect(await getChildStoredValue(child)).toEqual(new Fr(40n));
    });
  });

  describe('enqueued public calls', () => {
    let child: ChildContract;

    beforeEach(async () => {
      ({ contract: child } = await ChildContract.deploy(wallet).send({ from: defaultAccountAddress }));
    });

    // Enqueues one pub_inc_value(42) call via the parent and asserts child storage equals 42.
    it('enqueues a single public call', async () => {
      await parentContract.methods
        .enqueue_call_to_child(child.address, await child.methods.pub_inc_value.selector(), 42n)
        .send({ from: defaultAccountAddress });
      expect(await getChildStoredValue(child)).toEqual(new Fr(42n));
    });

    // Enqueues pub_inc_value(42) then pub_inc_value(43) via enqueue_call_to_child_twice; asserts 85.
    it('enqueues multiple public calls', async () => {
      await parentContract.methods
        .enqueue_call_to_child_twice(child.address, await child.methods.pub_inc_value.selector(), 42n)
        .send({ from: defaultAccountAddress });
      expect(await getChildStoredValue(child)).toEqual(new Fr(85n));
    });

    // Calls enqueue_call_to_pub_entry_point which enqueues pub_entry_point → pub_inc_value; asserts 42.
    it('enqueues a public call with nested public calls', async () => {
      await parentContract.methods
        .enqueue_call_to_pub_entry_point(child.address, await child.methods.pub_inc_value.selector(), 42n)
        .send({ from: defaultAccountAddress });
      expect(await getChildStoredValue(child)).toEqual(new Fr(42n));
    });

    // Calls enqueue_calls_to_pub_entry_point which enqueues pub_entry_point twice; asserts 85.
    it('enqueues multiple public calls with nested public calls', async () => {
      await parentContract.methods
        .enqueue_calls_to_pub_entry_point(child.address, await child.methods.pub_inc_value.selector(), 42n)
        .send({ from: defaultAccountAddress });
      expect(await getChildStoredValue(child)).toEqual(new Fr(85n));
    });
  });
});
