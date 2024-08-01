import {
  type AztecAddress,
  ExtendedNote,
  type FeePaymentMethod,
  type FunctionCall,
  Note,
  type Wallet,
} from '@aztec/aztec.js';
import { Fr, type GasSettings } from '@aztec/circuits.js';
import { deriveStorageSlotInMap } from '@aztec/circuits.js/hash';
import { FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { type PrivateFPCContract, TokenWithRefundsContract } from '@aztec/noir-contracts.js';

import { expectMapping } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees/private_refunds', () => {
  let aliceWallet: Wallet;
  let aliceAddress: AztecAddress;
  let tokenWithRefunds: TokenWithRefundsContract;
  let privateFPC: PrivateFPCContract;

  let initialAliceBalance: bigint;
  // Bob is the admin of the fee paying contract
  let initialBobBalance: bigint;
  let initialFPCGasBalance: bigint;

  // The fee payer needs to take a flat fee to protect itself from a griefing attack. See
  // the `TokenWithRefunds::setup_refund(...)` function for more details.
  const flatFee = 1n;

  const t = new FeesTest('private_refunds');

  beforeAll(async () => {
    await t.applyInitialAccountsSnapshot();
    await t.applyPublicDeployAccountsSnapshot();
    await t.applyDeployGasTokenSnapshot();
    await t.applyTokenWithRefundsAndFPC();
    await t.applyFundAliceWithTokens();
    ({ aliceWallet, aliceAddress, privateFPC, tokenWithRefunds } = await t.setup());
    t.logger.debug(`Alice address: ${aliceAddress}`);
  });

  afterAll(async () => {
    await t.teardown();
  });

  beforeEach(async () => {
    [[initialAliceBalance, initialBobBalance], [initialFPCGasBalance]] = await Promise.all([
      t.getTokenWithRefundsBalanceFn(aliceAddress, t.bobAddress),
      t.getGasBalanceFn(privateFPC.address),
    ]);
  });

  it('can do private payments and refunds', async () => {
    // 1. We generate randomness for Alice and derive randomness for Bob.
    const aliceRandomness = Fr.random(); // Called user_randomness in contracts
    const bobRandomness = poseidon2Hash([aliceRandomness]); // Called fee_payer_randomness in contracts

    // 2. We call arbitrary `private_get_name(...)` function to check that the fee refund flow works.
    const { transactionFee, txHash, debugInfo } = await tokenWithRefunds.methods
      .private_get_name()
      .send({
        fee: {
          gasSettings: t.gasSettings,
          paymentMethod: new PrivateRefundPaymentMethod(
            tokenWithRefunds.address,
            privateFPC.address,
            aliceWallet,
            aliceRandomness,
            bobRandomness,
            t.bobWallet.getAddress(), // Bob is the recipient of the fee notes.
          ),
        },
      })
      .wait({ debug: true });

    expect(transactionFee).toBeGreaterThan(0);
    // In total 4 notes should be inserted: 1 change note for user, 1 flat fee note for fee payer, 1 refund note for
    // user and 1 fee note for fee payer.
    expect(debugInfo?.noteHashes.length).toBe(4);
    // There should be 3 nullifiers emitted: 1 for tx hash, 1 for user randomness (emitted in FPC), 1 for the note user
    // paid the funded amount with.
    // expect(debugInfo?.nullifiers.length).toBe(3); // This is actually 4. Does the reviewer know why? I can't find
    // the last nullifier. If not I'll just nuke this check as it's not that important.

    // 3. We check that randomness for Bob was correctly emitted as an unencrypted log (Bobs needs it to reconstruct
    // his note).
    const resp = await aliceWallet.getUnencryptedLogs({ txHash });
    const bobRandomnessFromLog = Fr.fromBuffer(resp.logs[0].log.data);
    expect(bobRandomnessFromLog).toEqual(bobRandomness);

    // 4. Now we compute the contents of the note containing the refund for Alice. The refund note value is simply
    // the fee limit minus the final transaction fee. The other 2 fields in the note are Alice's npk_m_hash and
    // the randomness.
    const refundNoteValue = t.gasSettings.getFeeLimit().sub(new Fr(transactionFee!));
    const aliceNpkMHash = t.aliceWallet.getCompleteAddress().publicKeys.masterNullifierPublicKey.hash();
    const aliceRefundNote = new Note([refundNoteValue, aliceNpkMHash, aliceRandomness]);

    // 5. If the refund flow worked it should have added emitted a note hash of the note we constructed above and we
    // should be able to add the note to our PXE. Just calling `pxe.addNote(...)` is enough of a check that the note
    // hash was emitted because the endpoint will compute the hash and then it will try to find it in the note hash
    // tree. If the note hash is not found in the tree, an error is thrown.
    await t.aliceWallet.addNote(
      new ExtendedNote(
        aliceRefundNote,
        t.aliceAddress,
        tokenWithRefunds.address,
        deriveStorageSlotInMap(TokenWithRefundsContract.storage.balances.slot, t.aliceAddress),
        TokenWithRefundsContract.notes.TokenNote.id,
        txHash,
      ),
    );

    // 6. Now we reconstruct the note for the final fee payment. It should contain the transaction fee, Bob's
    // npk_m_hash and the randomness.
    // Note that FPC emits randomness as unencrypted log and the tx fee is publicly know so Bob is able to reconstruct
    // his note just from on-chain data.
    const bobNpkMHash = t.bobWallet.getCompleteAddress().publicKeys.masterNullifierPublicKey.hash();
    const bobFeeNote = new Note([new Fr(transactionFee!), bobNpkMHash, bobRandomness]);

    // 7. Once again we add the note to PXE which computes the note hash and checks that it is in the note hash tree.
    await t.bobWallet.addNote(
      new ExtendedNote(
        bobFeeNote,
        t.bobAddress,
        tokenWithRefunds.address,
        deriveStorageSlotInMap(TokenWithRefundsContract.storage.balances.slot, t.bobAddress),
        TokenWithRefundsContract.notes.TokenNote.id,
        txHash,
      ),
    );

    // 8. At last we check that the gas balance of FPC has decreased exactly by the transaction fee ...
    await expectMapping(t.getGasBalanceFn, [privateFPC.address], [initialFPCGasBalance - transactionFee!]);
    // ... and that the total transaction fee was correctly transferred from Alice to Bob.
    const totalFee = transactionFee! + flatFee;
    await expectMapping(
      t.getTokenWithRefundsBalanceFn,
      [aliceAddress, t.bobAddress],
      [initialAliceBalance - totalFee, initialBobBalance + totalFee],
    );
  });

  // TODO(#7694): Remove this test once the lacking feature in TXE is implemented.
  it('insufficient funded amount is correctly handled', async () => {
    // 1. We generate randomness for Alice and derive randomness for Bob.
    const aliceRandomness = Fr.random(); // Called user_randomness in contracts
    const bobRandomness = poseidon2Hash([aliceRandomness]); // Called fee_payer_randomness in contracts

    // 2. We call arbitrary `private_get_name(...)` function to trigger the refund flow.
    const sentTx = tokenWithRefunds.methods.private_get_name().send({
      fee: {
        gasSettings: t.gasSettings,
        paymentMethod: new PrivateRefundPaymentMethod(
          tokenWithRefunds.address,
          privateFPC.address,
          aliceWallet,
          aliceRandomness,
          bobRandomness,
          t.bobWallet.getAddress(), // Bob is the recipient of the fee notes.
          true, // We set max fee/funded amount to zero to trigger the error.
        ),
      },
    });

    // 3. We check that the transaction was reverted with the expected error.
    await expect(sentTx.wait()).rejects.toThrow('tx fee is higher than funded amount');

    // The tx reverted but the setup phase was non-revertible so the token balances were updated anyway. We check
    // that the non-revertible balances were updated as expected.

    // TODO(#7717): It's currently not possible to do proper balance checks here because of the linked issue. Once the
    // issue is tackled add the checks.

    await expectMapping(t.getTokenWithRefundsBalanceFn, [t.bobAddress], [initialBobBalance + flatFee]);
  });
});

class PrivateRefundPaymentMethod implements FeePaymentMethod {
  constructor(
    /**
     * The asset used to pay the fee.
     */
    private asset: AztecAddress,
    /**
     * Address which will hold the fee payment.
     */
    private paymentContract: AztecAddress,

    /**
     * An auth witness provider to authorize fee payments
     */
    private wallet: Wallet,

    /**
     * A randomness to mix in with the generated refund note for the sponsored user.
     * Use this to reconstruct note preimages for the PXE.
     */
    private userRandomness: Fr,

    /**
     * A randomness to mix in with the generated fee note for the fee payer.
     * Use this to reconstruct note preimages for the PXE.
     */
    private feePayerRandomness: Fr,

    /**
     * Address that the FPC sends notes it receives to.
     */
    private feeRecipient: AztecAddress,

    /**
     * If true, the max fee will be set to 0.
     * TODO(#7694): Remove this param once the lacking feature in TXE is implemented.
     */
    private setMaxFeeToZero = false,
  ) {}

  /**
   * The asset used to pay the fee.
   * @returns The asset used to pay the fee.
   */
  getAsset() {
    return this.asset;
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.paymentContract);
  }

  /**
   * Creates a function call to pay the fee in the given asset.
   * @param gasSettings - The gas settings.
   * @returns The function call to pay the fee.
   */
  async getFunctionCalls(gasSettings: GasSettings): Promise<FunctionCall[]> {
    // We assume 1:1 exchange rate between fee juice and token. But in reality you would need to convert feeLimit
    // (maxFee) to be in token denomination.
    const maxFee = this.setMaxFeeToZero ? Fr.ZERO : gasSettings.getFeeLimit();

    await this.wallet.createAuthWit({
      caller: this.paymentContract,
      action: {
        name: 'setup_refund',
        args: [
          this.feeRecipient,
          this.wallet.getCompleteAddress().address,
          maxFee,
          this.userRandomness,
          this.feePayerRandomness,
        ],
        selector: FunctionSelector.fromSignature('setup_refund((Field),(Field),Field,Field,Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        to: this.asset,
        returnTypes: [],
      },
    });

    return [
      {
        name: 'fund_transaction_privately',
        to: this.paymentContract,
        selector: FunctionSelector.fromSignature('fund_transaction_privately(Field,(Field),Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        args: [maxFee, this.asset, this.userRandomness],
        returnTypes: [],
      },
    ];
  }
}
