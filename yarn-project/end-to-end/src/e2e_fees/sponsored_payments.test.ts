import type { AztecAddress, AztecNode } from '@aztec/aztec.js';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee/testing';
import type { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import { GasSettings } from '@aztec/stdlib/gas';

import { expectMapping } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees sponsored_public_payment', () => {
  let aztecNode: AztecNode;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let sponsoredFPC: SponsoredFPCContract;
  let gasSettings: GasSettings;
  let bananaCoin: TokenContract;

  const t = new FeesTest('sponsored_payment');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applySponsoredFPCSetupSnapshot();
    await t.applyFundAliceWithBananas();
    ({ aztecNode, aliceAddress, bobAddress, sequencerAddress, sponsoredFPC, bananaCoin, gasSettings } =
      await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  let initialAlicePublicBananas: bigint;
  let initialAliceGas: bigint;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let initialBobPublicBananas: bigint;

  let initialFPCGas: bigint;

  let initialSequencerGas: bigint;

  beforeEach(async () => {
    gasSettings = GasSettings.from({
      ...gasSettings,
      maxFeesPerGas: await aztecNode.getCurrentBaseFees(),
    });

    [[initialAlicePublicBananas, initialBobPublicBananas], [initialAliceGas, initialFPCGas, initialSequencerGas]] =
      await Promise.all([
        t.getBananaPublicBalanceFn(aliceAddress, bobAddress),
        t.getGasBalanceFn(aliceAddress, sponsoredFPC.address, sequencerAddress),
      ]);
  });

  it('pays fees for tx that makes a public transfer', async () => {
    const bananasToSendToBob = 10n;
    const tx = await bananaCoin.methods
      .transfer_in_public(aliceAddress, bobAddress, bananasToSendToBob, 0)
      .send({
        from: aliceAddress,
        fee: {
          gasSettings,
          paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPC.address),
        },
      })
      .wait();

    const feeAmount = tx.transactionFee!;

    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bobAddress],
      [initialAlicePublicBananas - bananasToSendToBob, bananasToSendToBob],
    );

    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, sponsoredFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });
});
