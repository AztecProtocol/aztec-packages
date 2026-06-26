import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { TxExecutionResult } from '@aztec/aztec.js/tx';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { AutomineTestContext } from '../automine_test_context.js';

// Tests that a public nullifier emitted in one tx cannot be emitted again in a subsequent tx.
// Uses setup(1, AUTOMINE_E2E_OPTS) with one node, automine sequencer, one funded account.
describe('automine/execution/double_spend', () => {
  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;

  let logger: Logger;
  let teardown: () => Promise<void>;

  let contract: TestContract;

  beforeAll(async () => {
    // Setup environment
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
      logger,
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);

    ({ contract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));

    logger.info(`Test contract deployed at ${contract.address}`);
  });

  afterAll(() => teardown());

  // Verifies the public nullifier duplicate rejection path: simulation fails, then direct send reverts.
  describe('double spends', () => {
    // Emits nullifier=1 publicly, then simulates the same — expects "duplicate nullifier" error.
    // Then sends without simulation and expects REVERTED status.
    it('emits a public nullifier and then tries to emit the same nullifier', async () => {
      const nullifier = new Fr(1);
      await contract.methods.emit_nullifier_public(nullifier).send({ from: defaultAccountAddress });

      // We try emitting again, but our TX is dropped due to trying to emit a duplicate nullifier
      // first confirm that it fails simulation
      await expect(
        contract.methods.emit_nullifier_public(nullifier).simulate({ from: defaultAccountAddress }),
      ).rejects.toThrow(/Attempted to emit duplicate nullifier/);
      // if we skip simulation before submitting the tx,
      // tx will be included in a block but with app logic reverted
      await expect(
        contract.methods.emit_nullifier_public(nullifier).send({ from: defaultAccountAddress }),
      ).rejects.toThrow(TxExecutionResult.REVERTED);
    });
  });
});
