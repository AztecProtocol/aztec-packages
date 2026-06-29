import { ImportTestContract } from '@aztec/noir-test-contracts.js/ImportTest';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { AUTOMINE_E2E_OPTS } from '../fixtures/fixtures.js';
import { NestedContractTest } from './nested_contract_test.js';

// Tests cross-contract calls through the ImportTest contract (which imports functions from Test).
// NestedContractTest wraps setup(0, { ...AUTOMINE_E2E_OPTS, fundSponsoredFPC, skipAccountDeployment })
// with 1 public-deployed account. ImportTest and Test contracts are deployed fresh per test in beforeEach.
describe('e2e_nested_contract manual', () => {
  const t = new NestedContractTest('manual');
  let testContract: TestContract;
  let importerContract: ImportTestContract;
  let { wallet, logger, defaultAccountAddress } = t;

  beforeAll(async () => {
    await t.setup({ ...AUTOMINE_E2E_OPTS });
    ({ wallet, logger, defaultAccountAddress } = t);
  });

  beforeEach(async () => {
    ({ contract: importerContract } = await ImportTestContract.deploy(wallet).send({ from: defaultAccountAddress }));
    ({ contract: testContract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(async () => {
    await t.teardown();
  });

  // Calls importerContract.call_no_args(testContract.address) and awaits inclusion.
  it('calls a method no arguments', async () => {
    logger.info(`Calling noargs on importer contract`);
    await importerContract.methods.call_no_args(testContract.address).send({ from: defaultAccountAddress });
  });

  // Calls importerContract.call_public_fn(testContract.address) and awaits inclusion.
  it('calls a public function', async () => {
    logger.info(`Calling public_fn on importer contract`);
    await importerContract.methods.call_public_fn(testContract.address).send({ from: defaultAccountAddress });
  });

  // Calls importerContract.pub_call_public_fn(testContract.address) and awaits inclusion.
  it('calls a public function from a public function', async () => {
    logger.info(`Calling pub_public_fn on importer contract`);
    await importerContract.methods.pub_call_public_fn(testContract.address).send({ from: defaultAccountAddress });
  });
});
