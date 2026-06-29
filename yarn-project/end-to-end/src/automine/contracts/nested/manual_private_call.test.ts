import { AutomineTestContext } from '../../automine_test_context.js';

// Tests a nested private call from ParentContract into ChildContract's value() function.
// Runs on a single account. applyManualParentChild() deploys Parent and Child contracts in beforeAll.
describe('automine/contracts/nested/manual_private_call', () => {
  const t = new AutomineTestContext();
  let { parentContract, childContract, defaultAccountAddress } = t;

  beforeAll(async () => {
    await t.setup();
    await t.applyManualParentChild();
    ({ parentContract, childContract, defaultAccountAddress } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  // Calls parent.entry_point(child.address, child.value.selector()) and awaits inclusion.
  it('performs nested calls', async () => {
    await parentContract.methods
      .entry_point(childContract.address, await childContract.methods.value.selector())
      .send({ from: defaultAccountAddress });
  });
});
