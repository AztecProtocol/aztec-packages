import {
  type AztecAddress,
  type FeePaymentMethod,
  type FunctionCall,
  type Wallet,
  computeAuthWitMessageHash,
} from '@aztec/aztec.js';
import { type GasSettings } from '@aztec/circuits.js';
import { FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { type PrivateFPCContract, type PrivateTokenContract } from '@aztec/noir-contracts.js';

import { expectMapping } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees/private_refunds', () => {
  let aliceWallet: Wallet;
  let aliceAddress: AztecAddress;
  let privateToken: PrivateTokenContract;
  let privateFPC: PrivateFPCContract;

  let InitialAlicePrivateTokens: bigint;
  let InitialPrivateFPCPrivateTokens: bigint;
  let InitialPrivateFPCGas: bigint;

  const t = new FeesTest('private_payment_with_private_refund');

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
    [[InitialAlicePrivateTokens, InitialPrivateFPCPrivateTokens], [InitialPrivateFPCGas]] = await Promise.all([
      t.privateTokenBalances(aliceAddress),
      t.gasBalances(aliceAddress, privateFPC.address),
    ]);
  });

  it('can do private payments and refunds', async () => {
    t.logger.debug('running the transaction');
    const tx = await privateToken.methods
      .private_get_name()
      .send({
        fee: {
          gasSettings: t.gasSettings,
          paymentMethod: new PrivateRefundPaymentMethod(privateToken.address, privateFPC.address, aliceWallet),
        },
      })
      .wait();

    t.logger.debug('done the transaction');
    expect(tx.transactionFee).toBeGreaterThan(0);

    // const refund = t.maxFee - tx.transactionFee!;

    await expectMapping(t.privateTokenBalances, [aliceAddress], [InitialAlicePrivateTokens - tx.transactionFee!]);

    await expectMapping(t.gasBalances, [privateFPC.address], [InitialPrivateFPCGas - tx.transactionFee!]);
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
     * A secret to shield the rebate amount from the FPC.
     * Use this to claim the shielded amount to private balance
     */
    private rebateSecret = Fr.random(),
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
    const nonce = Fr.random();
    const maxFee = gasSettings.getFeeLimit();
    const messageHash = computeAuthWitMessageHash(
      this.paymentContract,
      this.wallet.getChainId(),
      this.wallet.getVersion(),
      {
        name: 'setup_refund',
        args: [this.wallet.getCompleteAddress().address, this.paymentContract, maxFee, nonce],
        selector: FunctionSelector.fromSignature('setup_refund((Field),(Field),Field,Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        to: this.asset,
        returnTypes: [],
      },
    );
    await this.wallet.createAuthWit(messageHash);

    return [
      {
        name: 'fund_transaction_privately',
        to: this.paymentContract,
        selector: FunctionSelector.fromSignature('fund_transaction_privately(Field,(Field),Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        args: [maxFee, this.asset, nonce],
        returnTypes: [],
      },
    ];
  }
}
