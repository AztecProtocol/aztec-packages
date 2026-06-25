import { AUTOMINE_E2E_OPTS } from '../fixtures/fixtures.js';
import { NestedContractTest } from './nested_contract_test.js';

// Tests a nested private call from ParentContract into ChildContract's value() function.
// NestedContractTest wraps setup(0, { ...AUTOMINE_E2E_OPTS, fundSponsoredFPC, skipAccountDeployment })
// with 1 public-deployed account. applyManual() deploys Parent and Child contracts in beforeAll.
describe('e2e_nested_contract manual', () => {
  const t = new NestedContractTest('manual');
  let { parentContract, childContract, defaultAccountAddress } = t;

  beforeAll(async () => {
    await t.setup({ ...AUTOMINE_E2E_OPTS });
    await t.applyManual();
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
