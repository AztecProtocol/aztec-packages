import {
  type AztecAddress,
  ExtendedNote,
  type FeePaymentMethod,
  type FunctionCall,
  Note,
  type Wallet,
} from '@aztec/aztec.js';
import { Fr, type GasSettings } from '@aztec/circuits.js';
import { FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { type PrivateFPCContract, PrivateTokenContract } from '@aztec/noir-contracts.js';

import { expectMapping } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees/private_refunds', () => {
  let aliceWallet: Wallet;
  let aliceAddress: AztecAddress;
  let privateToken: PrivateTokenContract;
  let privateFPC: PrivateFPCContract;

  let InitialAlicePrivateTokens: bigint;
  let InitialBobPrivateTokens: bigint;
  let InitialPrivateFPCGas: bigint;

  const t = new FeesTest('private_refunds');

  beforeAll(async () => {
    await t.applyInitialAccountsSnapshot();
    await t.applyPublicDeployAccountsSnapshot();
    await t.applyDeployGasTokenSnapshot();
    await t.applyPrivateTokenAndFPC();
    await t.applyFundAliceWithPrivateTokens();
    ({ aliceWallet, aliceAddress, privateFPC, privateToken } = await t.setup());
    t.logger.debug(`Alice address: ${aliceAddress}`);
  });

  afterAll(async () => {
    await t.teardown();
  });

  beforeEach(async () => {
    [[InitialAlicePrivateTokens, InitialBobPrivateTokens], [InitialPrivateFPCGas]] = await Promise.all([
      t.privateTokenBalances(aliceAddress, t.bobAddress),
      t.gasBalances(privateFPC.address),
    ]);
  });

  it('can do private payments and refunds', async () => {
    // TODO(#7324): The values in complete address are currently not updated after the keys are rotated so this does
    // not work with key rotation as the key might be the old one and then we would fetch a new one in the contract.
    const bobNpkMHash = t.bobWallet.getCompleteAddress().publicKeys.masterNullifierPublicKey.hash();
    const rebateNonce = new Fr(42);

    // 1. We call arbitrary `private_get_name(...)` function to check that the fee refund flow works.
    const tx = await privateToken.methods
      .private_get_name()
      .send({
        fee: {
          gasSettings: t.gasSettings,
          paymentMethod: new PrivateRefundPaymentMethod(
            privateToken.address,
            privateFPC.address,
            aliceWallet,
            rebateNonce,
            bobNpkMHash,
          ),
        },
      })
      .wait();

    expect(tx.transactionFee).toBeGreaterThan(0);

    // 2. Now we compute the contents of the note containing the refund for Alice. The refund note value is simply
    // the fee limit less the final transaction fee. The other 2 fields in the note are Alice's npk_m_hash and
    // the randomness.
    const refundNoteValue = t.gasSettings.getFeeLimit().sub(new Fr(tx.transactionFee!));
    // TODO(#7324): The values in complete address are currently not updated after the keys are rotated so this does
    // not work with key rotation as the key might be the old one and then we would fetch a new one in the contract.
    const aliceNpkMHash = t.aliceWallet.getCompleteAddress().publicKeys.masterNullifierPublicKey.hash();
    const aliceRefundNote = new Note([refundNoteValue, aliceNpkMHash, rebateNonce]);

    // 3. If the refund flow worked and it added a note with the expected values, we should be able to add the note
    // to our PXE. Just calling `pxe.addNote(...)` is enough of a check because the endpoint will compute the note
    // hash and then it will try to find the note hash in the note hash tree. If the note hash is not found
    // in the tree, an error is thrown.
    await t.aliceWallet.addNote(
      new ExtendedNote(
        aliceRefundNote,
        t.aliceAddress,
        privateToken.address,
        PrivateTokenContract.storage.balances.slot,
        PrivateTokenContract.notes.TokenNote.id,
        tx.txHash,
      ),
    );

    // 4. Check that the balances are as expected.
    const bobFeeNote = new Note([new Fr(tx.transactionFee!), bobNpkMHash, rebateNonce]);
    await t.bobWallet.addNote(
      new ExtendedNote(
        bobFeeNote,
        t.bobAddress,
        privateToken.address,
        PrivateTokenContract.storage.balances.slot,
        PrivateTokenContract.notes.TokenNote.id,
        tx.txHash,
      ),
    );

    await expectMapping(t.gasBalances, [privateFPC.address], [InitialPrivateFPCGas - tx.transactionFee!]);
    await expectMapping(
      t.privateTokenBalances,
      [aliceAddress, t.bobAddress],
      [InitialAlicePrivateTokens - tx.transactionFee!, InitialBobPrivateTokens + tx.transactionFee!],
    );
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
     * A nonce to mix in with the generated notes.
     * Use this to reconstruct note preimages for the PXE.
     */
    private rebateNonce: Fr,

    /**
     * The hash of the master nullifier public key that the FPC sends notes it receives to.
     */
    private feeRecipientNpkMHash: Fr,
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
    const maxFee = gasSettings.getFeeLimit();

    await this.wallet.createAuthWit({
      caller: this.paymentContract,
      action: {
        name: 'setup_refund',
        args: [this.feeRecipientNpkMHash, this.wallet.getCompleteAddress().address, maxFee, this.rebateNonce],
        selector: FunctionSelector.fromSignature('setup_refund(Field,(Field),Field,Field)'),
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
        args: [maxFee, this.asset, this.rebateNonce],
        returnTypes: [],
      },
    ];
  }
}
