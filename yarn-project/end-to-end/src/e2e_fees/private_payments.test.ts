import {
  type AccountWallet,
  type AztecAddress,
  BatchCall,
  type PXE,
  PrivateFeePaymentMethod,
  waitForProven,
} from '@aztec/aztec.js';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import type { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import { GasSettings } from '@aztec/stdlib/gas';
import { TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE } from '@aztec/stdlib/tx';

import { expectMapping } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees private_payment', () => {
  let aliceWallet: AccountWallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;
  let gasSettings: GasSettings;
  let pxe: PXE;

  const t = new FeesTest('private_payment');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFPCSetupSnapshot();
    await t.applyFundAliceWithBananas();
    ({ aliceWallet, aliceAddress, bobAddress, sequencerAddress, bananaCoin, bananaFPC, gasSettings, pxe } =
      await t.setup());

    // Prove up until the current state by just marking it as proven.
    // Then turn off the watcher to prevent it from keep proving
    await t.cheatCodes.rollup.advanceToNextEpoch();
    await t.catchUpProvenChain();
    t.setIsMarkingAsProven(false);
  });

  afterAll(async () => {
    await t.teardown();
  });

  let initialAlicePublicBananas: bigint;
  let initialAlicePrivateBananas: bigint;
  let initialAliceGas: bigint;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let initialBobPublicBananas: bigint;
  let initialBobPrivateBananas: bigint;

  let initialFPCPublicBananas: bigint;
  let initialFPCGas: bigint;

  let initialSequencerGas: bigint;

  beforeEach(async () => {
    gasSettings = GasSettings.from({
      ...gasSettings,
      maxFeesPerGas: await aliceWallet.getCurrentBaseFees(),
    });

    [
      [initialAlicePrivateBananas, initialBobPrivateBananas],
      [initialAlicePublicBananas, initialBobPublicBananas, initialFPCPublicBananas],
      [initialAliceGas, initialFPCGas, initialSequencerGas],
    ] = await Promise.all([
      t.getBananaPrivateBalanceFn(aliceAddress, bobAddress),
      t.getBananaPublicBalanceFn(aliceAddress, bobAddress, bananaFPC.address),
      t.getGasBalanceFn(aliceAddress, bananaFPC.address, sequencerAddress),
    ]);
  });

  it('pays fees for tx that dont run public app logic', async () => {
    /**
     * PRIVATE SETUP (1 nullifier for tx)
     * check authwit (1 nullifier)
     * reduce alice BC.private by MaxFee (1 nullifier)
     * setup fee and refund partial notes
     * setup public teardown call
     *
     * PRIVATE APP LOGIC
     * reduce Alice's BC.private by transferAmount (1 note)
     * create note for Bob of transferAmount (1 note)
     * encrypted logs of 944 bytes
     * unencrypted logs of 20 bytes
     *
     * PUBLIC APP LOGIC
     * N/A
     *
     * PUBLIC TEARDOWN
     *   increase sequencer/fee recipient/FPC admin private banana balance by feeAmount by finalizing partial note
     *   increase Alice's private banana balance by feeAmount by finalizing partial note
     *
     * this is expected to squash notes and nullifiers
     */
    const transferAmount = 5n;
    const interaction = bananaCoin.methods.transfer(bobAddress, transferAmount);
    const settings = {
      fee: {
        gasSettings,
        paymentMethod: new PrivateFeePaymentMethod(bananaFPC.address, aliceWallet),
      },
    };
    const localTx = await interaction.prove(settings);
    expect(localTx.data.feePayer).toEqual(bananaFPC.address);

    const sequencerRewardsBefore = await t.getCoinbaseSequencerRewards();
    const { sequencerBlockRewards } = await t.getBlockRewards();

    const tx = localTx.send();
    await tx.wait({ timeout: 300, interval: 10 });
    await t.cheatCodes.rollup.advanceToNextEpoch();

    const receipt = await tx.wait({ timeout: 300, interval: 10 });
    await waitForProven(pxe, receipt, { provenTimeout: 300 });

    // @note There is a potential race condition here if other tests send transactions that get into the same
    // epoch and thereby pays out fees at the same time (when proven).
    const expectedProverFee = await t.getProverFee(receipt.blockNumber!);
    await expect(t.getCoinbaseSequencerRewards()).resolves.toEqual(
      sequencerRewardsBefore + sequencerBlockRewards + receipt.transactionFee! - expectedProverFee,
    );
    const feeAmount = receipt.transactionFee!;

    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bobAddress],
      [initialAlicePrivateBananas - feeAmount - transferAmount, transferAmount],
    );

    // FPC should have received fee amount of bananas
    await expectMapping(t.getBananaPublicBalanceFn, [bananaFPC.address], [initialFPCPublicBananas + feeAmount]);

    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });

  it('pays fees for tx that creates notes in private', async () => {
    /**
     * PRIVATE SETUP
     * check authwit
     * reduce alice BC.private by MaxFee
     * setup fee and refund partial notes
     * setup public teardown call
     *
     * PRIVATE APP LOGIC
     * increase alice BC.private by newlyMintedBananas
     *
     * PUBLIC APP LOGIC
     * BC increase total supply
     *
     * PUBLIC TEARDOWN
     * increase sequencer/fee recipient/FPC admin private banana balance by feeAmount by finalizing partial note
     * increase Alice's private banana balance by feeAmount by finalizing partial note
     */
    const newlyMintedBananas = 10n;
    const from = aliceAddress; // we are setting from to Alice here because we need a sender to calculate the tag
    const tx = await bananaCoin.methods
      .mint_to_private(from, aliceAddress, newlyMintedBananas)
      .send({
        fee: {
          gasSettings,
          paymentMethod: new PrivateFeePaymentMethod(bananaFPC.address, aliceWallet),
        },
      })
      .wait();

    const feeAmount = tx.transactionFee!;

    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress],
      [initialAlicePrivateBananas - feeAmount + newlyMintedBananas],
    );

    // FPC should have received fee amount of bananas
    await expectMapping(t.getBananaPublicBalanceFn, [bananaFPC.address], [initialFPCPublicBananas + feeAmount]);

    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });

  it('pays fees for tx that creates notes in public', async () => {
    /**
     * PRIVATE SETUP
     * check authwit
     * reduce alice BC.private by MaxFee
     * setup fee and refund partial notes
     * setup public teardown call
     *
     * PRIVATE APP LOGIC
     * a partial note is prepared
     *
     * PUBLIC APP LOGIC
     * BC decrease Alice public balance by shieldedBananas
     * BC finalizes the partial note with an amount --> this is where the note is created in public
     *
     * PUBLIC TEARDOWN
     * increase sequencer/fee recipient/FPC admin private banana balance by feeAmount by finalizing partial note
     * increase Alice's private banana balance by feeAmount by finalizing partial note
     */
    const amountTransferredToPrivate = 1n;
    const tx = await bananaCoin.methods
      .transfer_to_private(aliceAddress, amountTransferredToPrivate)
      .send({
        fee: {
          gasSettings,
          paymentMethod: new PrivateFeePaymentMethod(bananaFPC.address, aliceWallet),
        },
      })
      .wait();

    const feeAmount = tx.transactionFee!;

    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress],
      [initialAlicePrivateBananas - feeAmount + amountTransferredToPrivate],
    );
    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address],
      [initialAlicePublicBananas - amountTransferredToPrivate, initialFPCPublicBananas + feeAmount],
    );
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });

  it('pays fees for tx that creates notes in both private and public', async () => {
    const amountTransferredInPrivate = 1n;
    const amountTransferredToPrivate = 2n;
    /**
     * PRIVATE SETUP
     * check authwit
     * reduce alice BC.private by MaxFee
     * setup fee and refund partial notes
     * setup public teardown call
     *
     * PRIVATE APP LOGIC
     * reduce Alice's private balance by privateTransfer
     * create note for Bob with privateTransfer amount of private BC
     * prepare partial note (in the transfer to private)
     *
     * PUBLIC APP LOGIC
     * BC decrease Alice public balance by amountTransferredToPrivate
     * BC finalize partial note with amountTransferredToPrivate (this is where the note is created in public)
     *
     * PUBLIC TEARDOWN
     * increase sequencer/fee recipient/FPC admin private banana balance by feeAmount by finalizing partial note
     * increase Alice's private banana balance by feeAmount by finalizing partial note
     */
    const tx = await new BatchCall(aliceWallet, [
      bananaCoin.methods.transfer(bobAddress, amountTransferredInPrivate),
      bananaCoin.methods.transfer_to_private(aliceAddress, amountTransferredToPrivate),
    ])
      .send({
        fee: {
          gasSettings,
          paymentMethod: new PrivateFeePaymentMethod(bananaFPC.address, aliceWallet),
        },
      })
      .wait();

    const feeAmount = tx.transactionFee!;

    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bobAddress],
      [
        initialAlicePrivateBananas - feeAmount - amountTransferredInPrivate + amountTransferredToPrivate,
        initialBobPrivateBananas + amountTransferredInPrivate,
      ],
    );
    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address],
      [initialAlicePublicBananas - amountTransferredToPrivate, initialFPCPublicBananas + feeAmount],
    );
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });

  it('rejects txs that dont have enough balance to cover gas costs', async () => {
    // deploy a copy of bananaFPC but don't fund it!
    const bankruptFPC = await FPCContract.deploy(aliceWallet, bananaCoin.address, aliceAddress).send().deployed();

    await expectMapping(t.getGasBalanceFn, [bankruptFPC.address], [0n]);

    const from = aliceAddress; // we are setting from to Alice here because we need a sender to calculate the tag
    await expect(
      bananaCoin.methods
        .mint_to_private(from, aliceAddress, 10)
        .send({
          fee: {
            gasSettings,
            paymentMethod: new PrivateFeePaymentMethod(bankruptFPC.address, aliceWallet),
          },
        })
        .wait(),
    ).rejects.toThrow(TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE);
  });

  // TODO(#7694): Remove this test once the lacking feature in TXE is implemented.
  it('insufficient funded amount is correctly handled', async () => {
    // We call arbitrary `private_get_name(...)` function just to check the correct error is triggered.
    await expect(
      bananaCoin.methods.private_get_name().simulate({
        fee: {
          gasSettings: t.gasSettings,
          paymentMethod: new PrivateFeePaymentMethod(
            bananaFPC.address,
            aliceWallet,
            true, // We set max fee/funded amount to 1 to trigger the error.
          ),
        },
      }),
    ).rejects.toThrow('max fee not enough to cover tx fee');
  });
});
