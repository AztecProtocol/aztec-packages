import { ImportTestContract } from '@aztec/noir-test-contracts.js/ImportTest';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { AUTOMINE_E2E_OPTS } from '../fixtures/fixtures.js';
import { NestedContractTest } from './nested_contract_test.js';

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

  it('calls a method no arguments', async () => {
    logger.info(`Calling noargs on importer contract`);
    await importerContract.methods.call_no_args(testContract.address).send({ from: defaultAccountAddress });
  });

  it('calls a public function', async () => {
    logger.info(`Calling public_fn on importer contract`);
    await importerContract.methods.call_public_fn(testContract.address).send({ from: defaultAccountAddress });
  });

  it('calls a public function from a public function', async () => {
    logger.info(`Calling pub_public_fn on importer contract`);
    await importerContract.methods.pub_call_public_fn(testContract.address).send({ from: defaultAccountAddress });
  });
});
