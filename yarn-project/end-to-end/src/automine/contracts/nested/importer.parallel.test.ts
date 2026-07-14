import { Fr } from '@aztec/aztec.js/fields';
import { ImportTestContract } from '@aztec/noir-test-contracts.js/ImportTest';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { AutomineTestContext } from '../../automine_test_context.js';

// Tests cross-contract calls through the ImportTest contract (which imports functions from Test).
// Runs on a single account. ImportTest and Test contracts are deployed fresh per test in beforeEach.
describe('automine/contracts/nested/importer', () => {
  const t = new AutomineTestContext();
  let testContract: TestContract;
  let importerContract: ImportTestContract;
  let { wallet, logger, defaultAccountAddress } = t;

  beforeAll(async () => {
    await t.setup();
    ({ wallet, logger, defaultAccountAddress } = t);
  });

  beforeEach(async () => {
    ({ contract: importerContract } = await ImportTestContract.deploy(wallet).send({ from: defaultAccountAddress }));
    ({ contract: testContract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(async () => {
    await t.teardown();
  });

  // call_no_args routes a private call into Test.get_this_address; asserts the imported call returns the
  // Test contract's own address, and that the tx is included on-chain.
  it('calls a method no arguments', async () => {
    logger.info(`Calling noargs on importer contract`);
    const { result } = await importerContract.methods
      .call_no_args(testContract.address)
      .simulate({ from: defaultAccountAddress });
    expect(result).toEqual(testContract.address);

    await importerContract.methods.call_no_args(testContract.address).send({ from: defaultAccountAddress });
  });

  // call_public_fn enqueues Test.emit_nullifier_public(1); asserts the nullifier landed by checking that
  // re-emitting the same nullifier on the Test contract is rejected as a duplicate.
  it('calls a public function', async () => {
    logger.info(`Calling public_fn on importer contract`);
    await importerContract.methods.call_public_fn(testContract.address).send({ from: defaultAccountAddress });

    await expect(
      testContract.methods.emit_nullifier_public(new Fr(1)).simulate({ from: defaultAccountAddress }),
    ).rejects.toThrow(/duplicate nullifier/);
  });

  // pub_call_public_fn calls Test.emit_nullifier_public(1) from a public function; asserts the nullifier
  // landed by checking that re-emitting the same nullifier on the Test contract is rejected as a duplicate.
  it('calls a public function from a public function', async () => {
    logger.info(`Calling pub_public_fn on importer contract`);
    await importerContract.methods.pub_call_public_fn(testContract.address).send({ from: defaultAccountAddress });

    await expect(
      testContract.methods.emit_nullifier_public(new Fr(1)).simulate({ from: defaultAccountAddress }),
    ).rejects.toThrow(/duplicate nullifier/);
  });
});
