import {
  type AccountWallet,
  type AztecAddress,
  type AztecNode,
  type CheatCodes,
  FeeJuicePaymentMethod,
} from '@aztec/aztec.js';
import { Fr, type GasSettings } from '@aztec/circuits.js';
import { TestContract } from '@aztec/noir-contracts.js/Test';

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

  const t = new FeesTest('fee_juice');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFundAliceWithFeeJuice();

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
      t.logger.info(`Initial L2 base fees are ${inspect(before)}`, { baseFees: before });

      // Bumps L1 base fee, updates the L1 fee oracle, and advances slots to update L2 base fees.
      // Do we need all these advance and upgrade calls? Probably not, but these calls are blazing fast,
      // so it's not big deal if we're throwing some unnecessary calls. We just want higher L2 base fees.
      t.logger.info(`Bumping L1 base fee per gas`);
      await cheatCodes.rollup.updateL1GasFeeOracle();
      await cheatCodes.eth.setNextBlockBaseFeePerGas(1e11);
      await cheatCodes.eth.mine();
      await cheatCodes.rollup.advanceSlots(6);
      await cheatCodes.rollup.updateL1GasFeeOracle();
      await cheatCodes.rollup.advanceSlots(6);
      await cheatCodes.rollup.updateL1GasFeeOracle();

      const after = await aztecNode.getCurrentBaseFees();
      t.logger.info(`L2 base fees after L1 gas spike are ${inspect(after)}`, { baseFees: after });
      expect(after.feePerL2Gas.toBigInt()).toBeGreaterThan(before.feePerL2Gas.toBigInt());
    };

    const sendTx = async (baseFeePadding: number | undefined) => {
      t.logger.info(`Preparing tx to be sent with base fee padding ${baseFeePadding}`);
      const tx = await testContract.methods
        .emit_nullifier_public(Fr.random())
        .prove({ fee: { gasSettings, paymentMethod, baseFeePadding } });
      const { maxFeesPerGas } = tx.data.constants.txContext.gasSettings;
      t.logger.info(`Tx with hash ${tx.getTxHash()} ready with max fees ${inspect(maxFeesPerGas)}`);
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
      await expect(sentWithNoPadding.wait({ timeout: 30 })).rejects.toThrow(/dropped./i);
      await sentWithDefaultPadding.wait({ timeout: 30 });
    });
  });
});
