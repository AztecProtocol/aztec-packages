import { NestedContractTest } from './nested_contract_test.js';

describe('e2e_nested_contract manual', () => {
  const t = new NestedContractTest('manual');
  let { parentContract, childContract, defaultAccountAddress } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyManualSnapshots();
    await t.setup();
    ({ parentContract, childContract, defaultAccountAddress } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  it('performs nested calls', async () => {
    await parentContract.methods
      .entry_point(childContract.address, await childContract.methods.value.selector())
      .send({ from: defaultAccountAddress })
      .wait();
  });
});
