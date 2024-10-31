import { type AccountWallet, type AztecAddress, PrivateFeePaymentMethod } from '@aztec/aztec.js';
import { type FPCContract, type TokenContract } from '@aztec/noir-contracts.js';

import { expectMapping } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees/private_refunds', () => {
  let aliceWallet: AccountWallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let bananaCoin: TokenContract;
  let bananaFPC: FPCContract;

  let initialAliceBalance: bigint;
  // Bob is the admin of the fee paying contract
  let initialBobBalance: bigint;
  let initialFPCGasBalance: bigint;

  const t = new FeesTest('private_refunds');

  beforeAll(async () => {
    await t.applyInitialAccountsSnapshot();
    await t.applyPublicDeployAccountsSnapshot();
    await t.applySetupFeeJuiceSnapshot();
    await t.applyDeployBananaTokenSnapshot();
    await t.applyFPCSetupSnapshot();
    await t.applyFundAliceWithPrivateBananas();
    ({ aliceWallet, aliceAddress, bobAddress, bananaFPC, bananaCoin } = await t.setup());

    t.logger.debug(`Alice address: ${aliceAddress}`);

    // We give Alice access to Bob's notes because Alice is used to check if balances are correct.
    aliceWallet.setScopes([aliceAddress, bobAddress]);
  });

  afterAll(async () => {
    await t.teardown();
  });

  beforeEach(async () => {
    [[initialAliceBalance, initialBobBalance], [initialFPCGasBalance]] = await Promise.all([
      t.getBananaPrivateBalanceFn(aliceAddress, t.bobAddress),
      t.getGasBalanceFn(bananaFPC.address),
    ]);
  });

  it('can do private payments and refunds', async () => {
    // 1. We call arbitrary `private_get_name(...)` function to check that the fee refund flow works.
    const { transactionFee } = await bananaCoin.methods
      .private_get_name()
      .send({
        fee: {
          gasSettings: t.gasSettings,
          paymentMethod: new PrivateFeePaymentMethod(
            bananaCoin.address,
            bananaFPC.address,
            aliceWallet,
            t.bobWallet.getAddress(), // Bob is the recipient of the fee notes.
          ),
        },
      })
      .wait();

    expect(transactionFee).toBeGreaterThan(0);

    // 3. At last we check that the gas balance of FPC has decreased exactly by the transaction fee ...
    await expectMapping(t.getGasBalanceFn, [bananaFPC.address], [initialFPCGasBalance - transactionFee!]);
    // ... and that the transaction fee was correctly transferred from Alice to Bob.
    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, t.bobAddress],
      [initialAliceBalance - transactionFee!, initialBobBalance + transactionFee!],
    );
  });

  // TODO(#7694): Remove this test once the lacking feature in TXE is implemented.
  it('insufficient funded amount is correctly handled', async () => {
    // 1. We call arbitrary `private_get_name(...)` function to check that the fee refund flow works.
    await expect(
      bananaCoin.methods.private_get_name().prove({
        fee: {
          gasSettings: t.gasSettings,
          paymentMethod: new PrivateFeePaymentMethod(
            bananaCoin.address,
            bananaFPC.address,
            aliceWallet,
            t.bobWallet.getAddress(), // Bob is the recipient of the fee notes.
            true, // We set max fee/funded amount to 1 to trigger the error.
          ),
        },
      }),
    ).rejects.toThrow('funded amount not enough to cover tx fee');
  });
});
