import {
  type AccountWallet,
  type AztecAddress,
  type FeePaymentMethod,
  type FunctionCall,
  type Wallet,
} from '@aztec/aztec.js';
import { Fr, type GasSettings } from '@aztec/circuits.js';
import { FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { type PrivateFPCContract, type TokenContract } from '@aztec/noir-contracts.js';

import { expectMapping } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees/private_refunds', () => {
  let aliceWallet: AccountWallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let token: TokenContract;
  let privateFPC: PrivateFPCContract;

  let initialAliceBalance: bigint;
  // Bob is the admin of the fee paying contract
  let initialBobBalance: bigint;
  let initialFPCGasBalance: bigint;

  const t = new FeesTest('private_refunds');

  beforeAll(async () => {
    await t.applyInitialAccountsSnapshot();
    await t.applyPublicDeployAccountsSnapshot();
    await t.applySetupFeeJuiceSnapshot();
    await t.applyTokenAndFPC();
    await t.applyFundAliceWithTokens();
    ({ aliceWallet, aliceAddress, bobAddress, privateFPC, token } = await t.setup());
    t.logger.debug(`Alice address: ${aliceAddress}`);

    // We give Alice access to Bob's notes because Alice is used to check if balances are correct.
    aliceWallet.setScopes([aliceAddress, bobAddress]);
  });

  afterAll(async () => {
    await t.teardown();
  });

  beforeEach(async () => {
    [[initialAliceBalance, initialBobBalance], [initialFPCGasBalance]] = await Promise.all([
      t.getTokenBalanceFn(aliceAddress, t.bobAddress),
      t.getGasBalanceFn(privateFPC.address),
    ]);
  });

  it('can do private payments and refunds', async () => {
    // 1. We call arbitrary `private_get_name(...)` function to check that the fee refund flow works.
    const { transactionFee } = await token.methods
      .private_get_name()
      .send({
        fee: {
          gasSettings: t.gasSettings,
          paymentMethod: new PrivateRefundPaymentMethod(
            token.address,
            privateFPC.address,
            aliceWallet,
            t.bobWallet.getAddress(), // Bob is the recipient of the fee notes.
          ),
        },
      })
      .wait();

    expect(transactionFee).toBeGreaterThan(0);

    // 3. At last we check that the gas balance of FPC has decreased exactly by the transaction fee ...
    await expectMapping(t.getGasBalanceFn, [privateFPC.address], [initialFPCGasBalance - transactionFee!]);
    // ... and that the transaction fee was correctly transferred from Alice to Bob.
    await expectMapping(
      t.getTokenBalanceFn,
      [aliceAddress, t.bobAddress],
      [initialAliceBalance - transactionFee!, initialBobBalance + transactionFee!],
    );
  });

  // TODO(#7694): Remove this test once the lacking feature in TXE is implemented.
  it('insufficient funded amount is correctly handled', async () => {
    // 1. We call arbitrary `private_get_name(...)` function to check that the fee refund flow works.
    await expect(
      token.methods.private_get_name().prove({
        fee: {
          gasSettings: t.gasSettings,
          paymentMethod: new PrivateRefundPaymentMethod(
            token.address,
            privateFPC.address,
            aliceWallet,
            t.bobWallet.getAddress(), // Bob is the recipient of the fee notes.
            true, // We set max fee/funded amount to 1 to trigger the error.
          ),
        },
      }),
    ).rejects.toThrow('funded amount not enough to cover tx fee');
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
     * Address that the FPC sends notes it receives to.
     */
    private feeRecipient: AztecAddress,

    /**
     * If true, the max fee will be set to 1.
     * TODO(#7694): Remove this param once the lacking feature in TXE is implemented.
     */
    private setMaxFeeToOne = false,
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
    const maxFee = this.setMaxFeeToOne ? Fr.ONE : gasSettings.getFeeLimit();

    await this.wallet.createAuthWit({
      caller: this.paymentContract,
      action: {
        name: 'setup_refund',
        args: [this.feeRecipient, this.wallet.getCompleteAddress().address, maxFee],
        selector: FunctionSelector.fromSignature('setup_refund((Field),(Field),Field)'),
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
        selector: FunctionSelector.fromSignature('fund_transaction_privately(Field,(Field))'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        args: [maxFee, this.asset],
        returnTypes: [],
      },
    ];
  }
}
