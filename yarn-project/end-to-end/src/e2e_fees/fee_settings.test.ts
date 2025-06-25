import {
  type AccountWallet,
  type AztecAddress,
  type AztecNode,
  FeeJuicePaymentMethod,
  retryUntil,
} from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec.js/testing';
import { Fr } from '@aztec/foundation/fields';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { GasSettings } from '@aztec/stdlib/gas';
import { TX_ERROR_INSUFFICIENT_FEE_PER_GAS } from '@aztec/stdlib/tx';

import { inspect } from 'util';

import { FeesTest } from './fees_test.js';

describe('e2e_fees fee settings', () => {
  let aztecNode: AztecNode;
  let cheatCodes: CheatCodes;
  let aliceAddress: AztecAddress;
  let aliceWallet: AccountWallet;
  let gasSettings: Partial<GasSettings>;
  let paymentMethod: FeeJuicePaymentMethod;
  let testContract: TestContract;

  const t = new FeesTest('fee_juice', 1);

  beforeAll(async () => {
    await t.applyBaseSnapshots();

    ({ aliceAddress, aliceWallet, gasSettings, cheatCodes, aztecNode } = await t.setup());

    testContract = await TestContract.deploy(aliceWallet).send().deployed();
    gasSettings = { ...gasSettings, maxFeesPerGas: undefined };
    paymentMethod = new FeeJuicePaymentMethod(aliceAddress);
  }, 60_000);

  afterAll(async () => {
    await t.teardown();
  });

  describe('setting max fee per gas', () => {
    const bumpL2Fees = async () => {
      const before = await aztecNode.getCurrentBaseFees();
      t.logger.info(`Initial L2 base fees are ${inspect(before)}`, { baseFees: before.toInspect() });
      await cheatCodes.rollup.bumpProvingCostPerMana(current => (current * 120n) / 100n);
      await retryUntil(
        async () => {
          const after = await aztecNode.getCurrentBaseFees();
          t.logger.info(`L2 base fees are now ${inspect(after)}`, {
            baseFeesBefore: before.toInspect(),
            baseFeesAfter: after.toInspect(),
          });
          return after.feePerL2Gas > before.feePerL2Gas;
        },
        'L2 base fee increase',
        5,
        1,
      );
    };

    const sendTx = async (baseFeePadding: number | undefined) => {
      t.logger.info(`Preparing tx to be sent with base fee padding ${baseFeePadding}`);
      const tx = await testContract.methods
        .emit_nullifier_public(Fr.random())
        .prove({ fee: { gasSettings, paymentMethod, baseFeePadding } });
      const { maxFeesPerGas } = tx.data.constants.txContext.gasSettings;
      t.logger.info(`Tx with hash ${await tx.getTxHash()} ready with max fees ${inspect(maxFeesPerGas)}`);
      return tx;
    };

    it('handles base fee spikes with default padding', async () => {
      // Prepare two txs using the current L2 base fees: one with no padding and one with default padding
      const txWithNoPadding = await sendTx(0);
      const txWithDefaultPadding = await sendTx(undefined);

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
