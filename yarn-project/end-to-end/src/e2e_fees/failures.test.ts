import {
  type AccountWallet,
  type AztecAddress,
  Fr,
  type FunctionCall,
  FunctionSelector,
  PrivateFeePaymentMethod,
  PublicFeePaymentMethod,
  TxStatus,
} from '@aztec/aztec.js';
import { Gas, GasSettings } from '@aztec/circuits.js';
import { FunctionType } from '@aztec/foundation/abi';
import { type TokenContract as BananaCoin, type FPCContract } from '@aztec/noir-contracts.js';

import { expectMapping } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees failures', () => {
  let aliceWallet: AccountWallet;
  let aliceAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;
  let gasSettings: GasSettings;

  const t = new FeesTest('failures');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFPCSetupSnapshot();
    ({ aliceWallet, aliceAddress, sequencerAddress, bananaCoin, bananaFPC, gasSettings } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  it('reverts transactions but still pays fees using PrivateFeePaymentMethod', async () => {
    const outrageousPublicAmountAliceDoesNotHave = t.ALICE_INITIAL_BANANAS * 5n;
    const privateMintedAlicePrivateBananas = t.ALICE_INITIAL_BANANAS;

    const [initialAlicePrivateBananas, initialSequencerPrivateBananas] = await t.getBananaPrivateBalanceFn(
      aliceAddress,
      sequencerAddress,
    );
    const [initialAliceGas, initialFPCGas] = await t.getGasBalanceFn(aliceAddress, bananaFPC.address);

    await t.mintPrivateBananas(privateMintedAlicePrivateBananas, aliceAddress);

    // if we simulate locally, it throws an error
    await expect(
      bananaCoin.methods
        // still use a public transfer so as to fail in the public app logic phase
        .transfer_in_public(aliceAddress, sequencerAddress, outrageousPublicAmountAliceDoesNotHave, 0)
        .send({
          fee: {
            gasSettings,
            paymentMethod: new PrivateFeePaymentMethod(
              bananaCoin.address,
              bananaFPC.address,
              aliceWallet,
              t.sequencerAddress,
            ),
          },
        })
        .wait(),
    ).rejects.toThrow(/attempt to subtract with underflow 'hi == high'/);

    // we did not pay the fee, because we did not submit the TX
    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress],
      [initialAlicePrivateBananas + privateMintedAlicePrivateBananas],
    );
    await expectMapping(t.getGasBalanceFn, [aliceAddress, bananaFPC.address], [initialAliceGas, initialFPCGas]);

    // We wait until the proven chain is caught up so all previous fees are paid out.
    await t.catchUpProvenChain();
    const currentSequencerL1Gas = await t.getCoinbaseBalance();

    const txReceipt = await bananaCoin.methods
      .transfer_in_public(aliceAddress, sequencerAddress, outrageousPublicAmountAliceDoesNotHave, 0)
      .send({
        skipPublicSimulation: true,
        fee: {
          gasSettings,
          paymentMethod: new PrivateFeePaymentMethod(
            bananaCoin.address,
            bananaFPC.address,
            aliceWallet,
            t.sequencerAddress,
          ),
        },
      })
      .wait({ dontThrowOnRevert: true });

    expect(txReceipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

    // We wait until the block is proven since that is when the payout happens.
    await t.catchUpProvenChain();

    const feeAmount = txReceipt.transactionFee!;
    const newSequencerL1FeeAssetBalance = await t.getCoinbaseBalance();
    expect(newSequencerL1FeeAssetBalance).toEqual(currentSequencerL1Gas + feeAmount);

    // and thus we paid the fee
    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, sequencerAddress],
      [
        // Even with the revert public teardown function got successfully executed so Alice received the refund note
        // and hence paid the actual fee.
        initialAlicePrivateBananas + privateMintedAlicePrivateBananas - feeAmount,
        // Sequencer is the FPC admin/fee recipient and hence he should have received the fee amount note
        initialSequencerPrivateBananas + feeAmount,
      ],
    );

    // Gas balance of Alice should have stayed the same as the FPC paid the gas fee and not her (she paid bananas
    // to FPC admin).
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address],
      [initialAliceGas, initialFPCGas - feeAmount],
    );
  });

  it('reverts transactions but still pays fees using PublicFeePaymentMethod', async () => {
    const outrageousPublicAmountAliceDoesNotHave = t.ALICE_INITIAL_BANANAS * 5n;
    const publicMintedAlicePublicBananas = t.ALICE_INITIAL_BANANAS;

    const [initialAlicePrivateBananas, initialSequencerPrivateBananas] = await t.getBananaPrivateBalanceFn(
      aliceAddress,
      sequencerAddress,
    );
    const [initialAlicePublicBananas, initialFPCPublicBananas] = await t.getBananaPublicBalanceFn(
      aliceAddress,
      bananaFPC.address,
    );
    const [initialAliceGas, initialFPCGas, initialSequencerGas] = await t.getGasBalanceFn(
      aliceAddress,
      bananaFPC.address,
      sequencerAddress,
    );

    await bananaCoin.methods.mint_to_public(aliceAddress, publicMintedAlicePublicBananas).send().wait();
    // if we simulate locally, it throws an error
    await expect(
      bananaCoin.methods
        .transfer_in_public(aliceAddress, sequencerAddress, outrageousPublicAmountAliceDoesNotHave, 0)
        .send({
          fee: {
            gasSettings,
            paymentMethod: new PublicFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet),
          },
        })
        .wait(),
    ).rejects.toThrow(/attempt to subtract with underflow 'hi == high'/);

    // we did not pay the fee, because we did not submit the TX
    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePrivateBananas, 0n, initialSequencerPrivateBananas],
    );
    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePublicBananas + publicMintedAlicePublicBananas, initialFPCPublicBananas, 0n],
    );
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas, initialSequencerGas],
    );

    // if we skip simulation, it includes the failed TX
    const txReceipt = await bananaCoin.methods
      .transfer_in_public(aliceAddress, sequencerAddress, outrageousPublicAmountAliceDoesNotHave, 0)
      .send({
        skipPublicSimulation: true,
        fee: {
          gasSettings,
          paymentMethod: new PublicFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet),
        },
      })
      .wait({ dontThrowOnRevert: true });

    expect(txReceipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);
    const feeAmount = txReceipt.transactionFee!;

    // and thus we paid the fee
    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePrivateBananas, 0n, initialSequencerPrivateBananas],
    );
    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePublicBananas + publicMintedAlicePublicBananas - feeAmount, initialFPCPublicBananas + feeAmount, 0n],
    );
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });

  it('fails transaction that error in setup', async () => {
    const OutrageousPublicAmountAliceDoesNotHave = BigInt(100e12);

    // simulation throws an error when setup fails
    await expect(
      bananaCoin.methods
        .transfer_in_public(aliceAddress, sequencerAddress, OutrageousPublicAmountAliceDoesNotHave, 0)
        .send({
          fee: {
            gasSettings,
            paymentMethod: new BuggedSetupFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet),
          },
        })
        .wait(),
    ).rejects.toThrow(/unauthorized/);

    // so does the sequencer
    await expect(
      bananaCoin.methods
        .transfer_in_public(aliceAddress, sequencerAddress, OutrageousPublicAmountAliceDoesNotHave, 0)
        .send({
          skipPublicSimulation: true,
          fee: {
            gasSettings,
            paymentMethod: new BuggedSetupFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet),
          },
        })
        .wait(),
    ).rejects.toThrow(/Transaction (0x)?[0-9a-fA-F]{64} was dropped\. Reason: Tx dropped by P2P node\./);
  });

  it('includes transaction that error in teardown', async () => {
    /**
     * We trigger an error in teardown by having the "FPC" call a function that reverts.
     */
    const publicMintedAlicePublicBananas = 100_000_000_000n;

    const [initialAlicePrivateBananas, initialSequencerPrivateBananas] = await t.getBananaPrivateBalanceFn(
      aliceAddress,
      sequencerAddress,
    );
    const [initialAlicePublicBananas, initialFPCPublicBananas] = await t.getBananaPublicBalanceFn(
      aliceAddress,
      bananaFPC.address,
    );
    const [initialAliceGas, initialFPCGas, initialSequencerGas] = await t.getGasBalanceFn(
      aliceAddress,
      bananaFPC.address,
      sequencerAddress,
    );

    await bananaCoin.methods.mint_to_public(aliceAddress, publicMintedAlicePublicBananas).send().wait();

    const badGas = GasSettings.from({
      gasLimits: gasSettings.gasLimits,
      maxFeesPerGas: gasSettings.maxFeesPerGas,
      teardownGasLimits: Gas.empty(),
    });

    await expect(
      bananaCoin.methods
        .mint_to_public(aliceAddress, 1n) // random operation
        .send({
          fee: {
            gasSettings: badGas,
            paymentMethod: new PublicFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet),
          },
        })
        .wait(),
    ).rejects.toThrow();

    const receipt = await bananaCoin.methods
      .mint_to_public(aliceAddress, 1n) // random operation
      .send({
        skipPublicSimulation: true,
        fee: {
          gasSettings: badGas,
          paymentMethod: new PublicFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet),
        },
      })
      .wait({
        dontThrowOnRevert: true,
      });
    expect(receipt.status).toEqual(TxStatus.TEARDOWN_REVERTED);
    expect(receipt.transactionFee).toBeGreaterThan(0n);

    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePrivateBananas, 0n, initialSequencerPrivateBananas],
    );
    // Since setup went through, Alice transferred to the FPC
    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [
        initialAlicePublicBananas + publicMintedAlicePublicBananas - badGas.getFeeLimit().toBigInt(),
        initialFPCPublicBananas + badGas.getFeeLimit().toBigInt(),
        0n,
      ],
    );
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - receipt.transactionFee!, initialSequencerGas],
    );
  });
});

class BuggedSetupFeePaymentMethod extends PublicFeePaymentMethod {
  override getFunctionCalls(gasSettings: GasSettings): Promise<FunctionCall[]> {
    const maxFee = gasSettings.getFeeLimit();
    const nonce = Fr.random();

    const tooMuchFee = new Fr(maxFee.toBigInt() * 2n);

    return Promise.resolve([
      this.wallet
        .setPublicAuthWit(
          {
            caller: this.paymentContract,
            action: {
              name: 'transfer_in_public',
              args: [this.wallet.getAddress().toField(), this.paymentContract.toField(), maxFee, nonce],
              selector: FunctionSelector.fromSignature('transfer_in_public((Field),(Field),Field,Field)'),
              type: FunctionType.PUBLIC,
              isStatic: false,
              to: this.asset,
              returnTypes: [],
            },
          },
          true,
        )
        .request(),
      {
        name: 'fee_entrypoint_public',
        to: this.paymentContract,
        selector: FunctionSelector.fromSignature('fee_entrypoint_public(Field,(Field),Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        args: [tooMuchFee, this.asset.toField(), nonce],
        returnTypes: [],
      },
    ]);
  }
}
