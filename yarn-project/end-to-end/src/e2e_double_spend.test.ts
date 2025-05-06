import { type AccountWallet, Fr, type Logger, TxStatus } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { setup } from './fixtures/utils.js';

describe('e2e_double_spend', () => {
  let wallet: AccountWallet;

  let logger: Logger;
  let teardown: () => Promise<void>;

  let contract: TestContract;

  beforeAll(async () => {
    // Setup environment
    ({ teardown, wallet, logger } = await setup(1));

    contract = await TestContract.deploy(wallet).send().deployed();

    logger.info(`Test contract deployed at ${contract.address}`);
  });

  afterAll(() => teardown());

  describe('double spends', () => {
    it('emits a public nullifier and then tries to emit the same nullifier', async () => {
      const nullifier = new Fr(1);
      await contract.methods.emit_nullifier_public(nullifier).send().wait();

      // We try emitting again, but our TX is dropped due to trying to emit a duplicate nullifier
      // first confirm that it fails simulation
      await expect(contract.methods.emit_nullifier_public(nullifier).simulate()).rejects.toThrow(
        /Attempted to emit duplicate nullifier/,
      );
      // if we skip simulation before submitting the tx,
      // tx will be included in a block but with app logic reverted
      await expect(contract.methods.emit_nullifier_public(nullifier).send().wait()).rejects.toThrow(
        TxStatus.APP_LOGIC_REVERTED,
      );
    });
  });
});
