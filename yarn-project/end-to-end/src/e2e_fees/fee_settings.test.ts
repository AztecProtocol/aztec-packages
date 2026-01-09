import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { AztecNode } from '@aztec/aztec.js/node';
import { CheatCodes } from '@aztec/aztec/testing';
import { Fr } from '@aztec/foundation/curves/bn254';
import { retryUntil } from '@aztec/foundation/retry';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { GasSettings } from '@aztec/stdlib/gas';
import { TX_ERROR_INSUFFICIENT_FEE_PER_GAS } from '@aztec/stdlib/tx';
import type { TestWallet } from '@aztec/test-wallet/server';
import { proveInteraction } from '@aztec/test-wallet/server';

import { inspect } from 'util';

import { FeesTest } from './fees_test.js';

describe('e2e_fees fee settings', () => {
  let aztecNode: AztecNode;
  let cheatCodes: CheatCodes;
  let aliceAddress: AztecAddress;
  let wallet: TestWallet;
  let gasSettings: Partial<GasSettings>;
  let testContract: TestContract;
  const t = new FeesTest('fee_juice', 1);

  beforeAll(async () => {
    await t.applyBaseSnapshots();

    ({ aliceAddress, wallet, gasSettings, cheatCodes, aztecNode } = await t.setup());

    testContract = await TestContract.deploy(wallet).send({ from: aliceAddress }).deployed();
    gasSettings = { ...gasSettings, maxFeesPerGas: undefined };
  });

  afterAll(async () => {
    await t.teardown();
  });

  describe('setting max fee per gas', () => {
    const bumpL2Fees = async () => {
      const before = await aztecNode.getCurrentMinFees();
      t.logger.info(`Initial L2 min fees are ${inspect(before)}`, { minFees: before.toInspect() });
      await cheatCodes.rollup.bumpProvingCostPerMana(current => (current * 120n) / 100n);
      await retryUntil(
        async () => {
          const after = await aztecNode.getCurrentMinFees();
          t.logger.info(`L2 min fees are now ${inspect(after)}`, {
            minFeesBefore: before.toInspect(),
            minFeesAfter: after.toInspect(),
          });
          return after.feePerL2Gas > before.feePerL2Gas;
        },
        'L2 min fee increase',
        5,
        1,
      );
    };

    const proveTx = async (minFeePadding: number | undefined) => {
      t.logger.info(`Preparing tx to be sent with min fee padding ${minFeePadding}`);
      wallet.setMinFeePadding(minFeePadding);
      const tx = await proveInteraction(wallet, testContract.methods.emit_nullifier_public(Fr.random()), {
        from: aliceAddress,
        fee: { gasSettings },
      });
      const { maxFeesPerGas } = tx.data.constants.txContext.gasSettings;
      t.logger.info(`Tx with hash ${tx.getTxHash().toString()} ready with max fees ${inspect(maxFeesPerGas)}`);
      return tx;
    };

    it('handles min fee spikes with default padding', async () => {
      // Prepare two txs using the current L2 min fees: one with no padding and one with default padding
      const txWithNoPadding = await proveTx(0);
      const txWithDefaultPadding = await proveTx(undefined);

      // Now bump the L2 fees before we actually send them
      await bumpL2Fees();

      // And check that the no-padding does not get mined, but the default padding is good enough
      t.logger.info(`Sendings txs`);
      const sentWithNoPadding = txWithNoPadding.send();
      const sentWithDefaultPadding = txWithDefaultPadding.send();
      t.logger.info(`Awaiting txs`);
      await expect(sentWithNoPadding.wait({ timeout: 30 })).rejects.toThrow(TX_ERROR_INSUFFICIENT_FEE_PER_GAS);
      await sentWithDefaultPadding.wait({ timeout: 30 });
    });
  });
});
