import {
  type AccountWallet,
  type AztecAddress,
  Fr,
  type FunctionCall,
  FunctionSelector,
  PublicFeePaymentMethod,
  TxStatus,
  computeAuthWitMessageHash,
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

  it('reverts transactions but still pays fees using PublicFeePaymentMethod', async () => {
    const OutrageousPublicAmountAliceDoesNotHave = BigInt(1e15);
    const PublicMintedAlicePublicBananas = BigInt(1e12);

    const [initialAlicePrivateBananas, initialFPCPrivateBananas] = await t.bananaPrivateBalances(
      aliceAddress,
      bananaFPC.address,
    );
    const [initialAlicePublicBananas, initialFPCPublicBananas] = await t.bananaPublicBalances(
      aliceAddress,
      bananaFPC.address,
    );
    const [initialAliceGas, initialFPCGas, initialSequencerGas] = await t.gasBalances(
      aliceAddress,
      bananaFPC.address,
      sequencerAddress,
    );

    await bananaCoin.methods.mint_public(aliceAddress, PublicMintedAlicePublicBananas).send().wait();
    // if we simulate locally, it throws an error
    await expect(
      bananaCoin.methods
        .transfer_public(aliceAddress, sequencerAddress, OutrageousPublicAmountAliceDoesNotHave, 0)
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
      t.bananaPrivateBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePrivateBananas, initialFPCPrivateBananas, 0n],
    );
    await expectMapping(
      t.bananaPublicBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePublicBananas + PublicMintedAlicePublicBananas, initialFPCPublicBananas, 0n],
    );
    await expectMapping(
      t.gasBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas, initialSequencerGas],
    );

    // if we skip simulation, it includes the failed TX
    const txReceipt = await bananaCoin.methods
      .transfer_public(aliceAddress, sequencerAddress, OutrageousPublicAmountAliceDoesNotHave, 0)
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
      t.bananaPrivateBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePrivateBananas, initialFPCPrivateBananas, 0n],
    );
    await expectMapping(
      t.bananaPublicBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePublicBananas + PublicMintedAlicePublicBananas - feeAmount, initialFPCPublicBananas + feeAmount, 0n],
    );
    await expectMapping(
      t.gasBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );

    // TODO(#4712) - demonstrate reverts with the PrivateFeePaymentMethod.
    // Can't do presently because all logs are "revertible" so we lose notes that get broadcasted during unshielding.
  });

  it('fails transaction that error in setup', async () => {
    const OutrageousPublicAmountAliceDoesNotHave = BigInt(100e12);

    // simulation throws an error when setup fails
    await expect(
      bananaCoin.methods
        .transfer_public(aliceAddress, sequencerAddress, OutrageousPublicAmountAliceDoesNotHave, 0)
        .send({
          fee: {
            gasSettings,
            paymentMethod: new BuggedSetupFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet),
          },
        })
        .wait(),
    ).rejects.toThrow(/Message not authorized by account 'is_valid == true'/);

    // so does the sequencer
    await expect(
      bananaCoin.methods
        .transfer_public(aliceAddress, sequencerAddress, OutrageousPublicAmountAliceDoesNotHave, 0)
        .send({
          skipPublicSimulation: true,
          fee: {
            gasSettings,
            paymentMethod: new BuggedSetupFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet),
          },
        })
        .wait(),
    ).rejects.toThrow(/Transaction [0-9a-f]{64} was dropped\. Reason: Tx dropped by P2P node\./);
  });

  it('includes transaction that error in teardown', async () => {
    /**
     * We trigger an error in teardown by having the "FPC" call a function that reverts.
     */
    const PublicMintedAlicePublicBananas = 100_000_000_000n;

    const [initialAlicePrivateBananas, initialFPCPrivateBananas] = await t.bananaPrivateBalances(
      aliceAddress,
      bananaFPC.address,
    );
    const [initialAlicePublicBananas, initialFPCPublicBananas] = await t.bananaPublicBalances(
      aliceAddress,
      bananaFPC.address,
    );
    const [initialAliceGas, initialFPCGas, initialSequencerGas] = await t.gasBalances(
      aliceAddress,
      bananaFPC.address,
      sequencerAddress,
    );

    await bananaCoin.methods.mint_public(aliceAddress, PublicMintedAlicePublicBananas).send().wait();

    const badGas = GasSettings.from({
      gasLimits: gasSettings.gasLimits,
      inclusionFee: gasSettings.inclusionFee,
      maxFeesPerGas: gasSettings.maxFeesPerGas,
      teardownGasLimits: Gas.empty(),
    });

    await expect(
      bananaCoin.methods
        .mint_public(aliceAddress, 1n) // random operation
        .send({
          fee: {
            gasSettings: badGas,
            paymentMethod: new PublicFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet),
          },
        })
        .wait(),
    ).rejects.toThrow();

    const receipt = await bananaCoin.methods
      .mint_public(aliceAddress, 1n) // random operation
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
      t.bananaPrivateBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePrivateBananas, initialFPCPrivateBananas, 0n],
    );
    // Since setup went through, Alice transferred to the FPC
    await expectMapping(
      t.bananaPublicBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [
        initialAlicePublicBananas + PublicMintedAlicePublicBananas - badGas.getFeeLimit().toBigInt(),
        initialFPCPublicBananas + badGas.getFeeLimit().toBigInt(),
        0n,
      ],
    );
    await expectMapping(
      t.gasBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - receipt.transactionFee!, initialSequencerGas],
    );
  });
});

class BuggedSetupFeePaymentMethod extends PublicFeePaymentMethod {
  override getFunctionCalls(gasSettings: GasSettings): Promise<FunctionCall[]> {
    const maxFee = gasSettings.getFeeLimit();
    const nonce = Fr.random();
    const messageHash = computeAuthWitMessageHash(
      this.paymentContract,
      this.wallet.getChainId(),
      this.wallet.getVersion(),
      {
        name: 'transfer_public',
        args: [this.wallet.getAddress(), this.paymentContract, maxFee, nonce],
        selector: FunctionSelector.fromSignature('transfer_public((Field),(Field),Field,Field)'),
        type: FunctionType.PUBLIC,
        isStatic: false,
        to: this.asset,
        returnTypes: [],
      },
    );

    const tooMuchFee = new Fr(maxFee.toBigInt() * 2n);

    return Promise.resolve([
      this.wallet.setPublicAuthWit(messageHash, true).request(),
      {
        name: 'fee_entrypoint_public',
        to: this.paymentContract,
        selector: FunctionSelector.fromSignature('fee_entrypoint_public(Field,(Field),Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        args: [tooMuchFee, this.asset, nonce],
        returnTypes: [],
      },
    ]);
  }
}
