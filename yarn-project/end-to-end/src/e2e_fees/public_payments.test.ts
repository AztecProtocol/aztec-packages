import { type AccountWallet, type AztecAddress, PublicFeePaymentMethod } from '@aztec/aztec.js';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import type { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import { GasSettings } from '@aztec/stdlib/gas';

import { expectMapping } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees public_payment', () => {
  let aliceWallet: AccountWallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;
  let gasSettings: GasSettings;

  const t = new FeesTest('public_payment');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFPCSetupSnapshot();
    await t.applyFundAliceWithBananas();
    ({ aliceWallet, aliceAddress, bobAddress, sequencerAddress, bananaCoin, bananaFPC, gasSettings } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  let initialAlicePublicBananas: bigint;
  let initialAliceGas: bigint;

  let initialBobPublicBananas: bigint;

  let initialFPCPublicBananas: bigint;
  let initialFPCGas: bigint;

  let initialSequencerGas: bigint;

  beforeEach(async () => {
    gasSettings = GasSettings.from({
      ...gasSettings,
      maxFeesPerGas: await aliceWallet.getCurrentBaseFees(),
    });

    [
      [initialAlicePublicBananas, initialBobPublicBananas, initialFPCPublicBananas],
      [initialAliceGas, initialFPCGas, initialSequencerGas],
    ] = await Promise.all([
      t.getBananaPublicBalanceFn(aliceAddress, bobAddress, bananaFPC.address),
      t.getGasBalanceFn(aliceAddress, bananaFPC.address, sequencerAddress),
    ]);
  });

  it('pays fees for tx that make public transfer', async () => {
    const bananasToSendToBob = 10n;
    // docs:start:fpc
    const tx = await bananaCoin.methods
      .transfer_in_public(aliceAddress, bobAddress, bananasToSendToBob, 0)
      .send({
        fee: {
          gasSettings,
          paymentMethod: new PublicFeePaymentMethod(bananaFPC.address, aliceWallet),
        },
      })
      .wait();
    // docs:end:fpc

    const feeAmount = tx.transactionFee!;

    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address, bobAddress],
      [
        initialAlicePublicBananas - (feeAmount + bananasToSendToBob),
        initialFPCPublicBananas + feeAmount,
        initialBobPublicBananas + bananasToSendToBob,
      ],
    );

    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });
});
