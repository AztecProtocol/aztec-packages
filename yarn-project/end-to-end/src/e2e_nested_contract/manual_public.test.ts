import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { serializeToBuffer } from '@aztec/foundation/serialize';

import { AUTOMINE_E2E_OPTS } from '../fixtures/fixtures.js';
import { NestedContractTest } from './nested_contract_test.js';

// Tests public-to-public nested calls and ordering guarantees (public before private enqueue).
// NestedContractTest wraps setup(0, { ...AUTOMINE_E2E_OPTS, fundSponsoredFPC, skipAccountDeployment })
// with 1 public-deployed account. applyManual() deploys Parent and Child contracts in beforeAll.
describe('e2e_nested_contract manual', () => {
  const t = new NestedContractTest('manual');
  let { wallet, parentContract, childContract, defaultAccountAddress, aztecNode } = t;

  const getChildStoredValue = (child: { address: AztecAddress }) =>
    aztecNode.getPublicStorageAt('latest', child.address, new Fr(1));

  beforeAll(async () => {
    await t.setup({ ...AUTOMINE_E2E_OPTS });
    await t.applyManual();
    ({ wallet, parentContract, childContract, defaultAccountAddress, aztecNode } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  // Calls parent.pub_entry_point(child, pub_get_value, 42) and awaits inclusion.
  it('performs public nested calls', async () => {
    await parentContract.methods
      .pub_entry_point(childContract.address, await childContract.methods.pub_get_value.selector(), 42n)
      .send({ from: defaultAccountAddress });
  });

  // Regression for https://github.com/AztecProtocol/aztec-packages/issues/640
  // Calls pub_entry_point_twice so pub_inc_value runs twice in one tx; asserts storage is 84 (not 42).
  it('reads fresh value after write within the same tx', async () => {
    await parentContract.methods
      .pub_entry_point_twice(childContract.address, await childContract.methods.pub_inc_value.selector(), 42n)
      .send({ from: defaultAccountAddress });
    expect(await getChildStoredValue(childContract)).toEqual(new Fr(84n));
  });

  // Regression for https://github.com/AztecProtocol/aztec-packages/issues/1645
  // Executes a public call first and then a private call (which enqueues another public call)
  // through the account contract, if the account entrypoint behaves properly, it will honor
  // this order and not run the private call first which results in the public calls being inverted.
  // Batches pub_set_value(20) and parent.enqueue(pub_set_value(40)); reads public logs to assert [20, 40].
  it('executes public calls in expected order', async () => {
    const pubSetValueSelector = await childContract.methods.pub_set_value.selector();
    const actions = [
      childContract.methods.pub_set_value(20n),
      parentContract.methods.enqueue_call_to_child(childContract.address, pubSetValueSelector, 40n),
    ];

    const { receipt: tx } = await new BatchCall(wallet, actions).send({ from: defaultAccountAddress });
    const block = (await aztecNode.getBlock({ number: tx.blockNumber! }, { includeTransactions: true }))!;
    const allPublicLogs = block.body.txEffects.flatMap(tx => tx.publicLogs);
    const processedLogs = allPublicLogs.map(log => toBigIntBE(serializeToBuffer(log.getEmittedFields())));
    expect(processedLogs).toEqual([20n, 40n]);
    expect(await getChildStoredValue(childContract)).toEqual(new Fr(40n));
  });
});
