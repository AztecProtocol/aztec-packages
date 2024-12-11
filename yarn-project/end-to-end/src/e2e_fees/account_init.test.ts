import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import {
  type AccountManager,
  type AccountWallet,
  FeeJuicePaymentMethod,
  FeeJuicePaymentMethodWithClaim,
  Fr,
  type Logger,
  type PXE,
  PrivateFeePaymentMethod,
  PublicFeePaymentMethod,
  Schnorr,
  type Wallet,
  deriveKeys,
} from '@aztec/aztec.js';
import {
  type AztecAddress,
  type CompleteAddress,
  FEE_FUNDING_FOR_TESTER_ACCOUNT,
  Fq,
  type GasSettings,
} from '@aztec/circuits.js';
import { type FPCContract } from '@aztec/noir-contracts.js/FPC';
import { SchnorrAccountContract } from '@aztec/noir-contracts.js/SchnorrAccount';
import { type TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { FeesTest } from './fees_test.js';

jest.setTimeout(300_000);

describe('e2e_fees account_init', () => {
  const t = new FeesTest('account_init');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFundAliceWithBananas();
    await t.applyFPCSetupSnapshot();
    ({ aliceAddress, aliceWallet, bananaCoin, bananaFPC, pxe, logger } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let logger: Logger;
  let pxe: PXE;
  let gasSettings: GasSettings;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;

  // Alice pays for deployments when we need someone else to intervene
  let aliceWallet: Wallet;
  let aliceAddress: AztecAddress;

  // Bob is the account being created (a fresh account is generated for each test)
  let bobsSecretKey: Fr;
  let bobsPrivateSigningKey: Fq;
  let bobsAccountManager: AccountManager;
  let bobsCompleteAddress: CompleteAddress;
  let bobsAddress: AztecAddress;
  let bobsWallet: AccountWallet;

  // Seeded by initBalances below in a beforeEach hook
  let fpcsInitialGas: bigint;
  let fpcsInitialPublicBananas: bigint;
  let sequencerInitialPrivateBananas: bigint;

  async function initBalances() {
    [[fpcsInitialGas], [fpcsInitialPublicBananas], [sequencerInitialPrivateBananas]] = await Promise.all([
      t.getGasBalanceFn(bananaFPC.address),
      t.getBananaPublicBalanceFn(bananaFPC.address),
      t.getBananaPrivateBalanceFn(t.sequencerAddress),
    ]);
  }

  beforeEach(async () => {
    bobsSecretKey = Fr.random();
    bobsPrivateSigningKey = Fq.random();
    bobsAccountManager = getSchnorrAccount(pxe, bobsSecretKey, bobsPrivateSigningKey, Fr.random());
    bobsCompleteAddress = bobsAccountManager.getCompleteAddress();
    bobsAddress = bobsCompleteAddress.address;
    bobsWallet = await bobsAccountManager.getWallet();

    await bobsAccountManager.register();
    await initBalances();
  });

  describe('account pays its own fee', () => {
    it('pays natively in the Fee Juice after Alice bridges funds', async () => {
      await t.mintAndBridgeFeeJuice(bobsAddress, FEE_FUNDING_FOR_TESTER_ACCOUNT);
      const [bobsInitialGas] = await t.getGasBalanceFn(bobsAddress);
      expect(bobsInitialGas).toEqual(FEE_FUNDING_FOR_TESTER_ACCOUNT);

      const paymentMethod = new FeeJuicePaymentMethod(bobsAddress);
      const tx = await bobsAccountManager.deploy({ fee: { gasSettings, paymentMethod } }).wait();

      expect(tx.transactionFee!).toBeGreaterThan(0n);
      await expect(t.getGasBalanceFn(bobsAddress)).resolves.toEqual([bobsInitialGas - tx.transactionFee!]);
    });

    it('pays natively in the Fee Juice by bridging funds themselves', async () => {
      const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(FEE_FUNDING_FOR_TESTER_ACCOUNT, bobsAddress);
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(bobsAddress, claim);
      const tx = await bobsAccountManager.deploy({ fee: { gasSettings, paymentMethod } }).wait();
      expect(tx.transactionFee!).toBeGreaterThan(0n);
      await expect(t.getGasBalanceFn(bobsAddress)).resolves.toEqual([
        FEE_FUNDING_FOR_TESTER_ACCOUNT - tx.transactionFee!,
      ]);
    });

    it('pays privately through an FPC', async () => {
      // Alice mints bananas to Bob
      const mintedBananas = FEE_FUNDING_FOR_TESTER_ACCOUNT;
      await t.mintPrivateBananas(mintedBananas, bobsAddress);

      // Bob deploys his account through the private FPC
      const paymentMethod = new PrivateFeePaymentMethod(
        bananaFPC.address,
        await bobsAccountManager.getWallet(),
        t.sequencerAddress, // Sequencer is the recipient of the refund fee notes because it's the FPC admin.
      );

      const tx = await bobsAccountManager.deploy({ fee: { gasSettings, paymentMethod } }).wait();
      const actualFee = tx.transactionFee!;
      expect(actualFee).toBeGreaterThan(0n);

      // We have gotten a refund note so our balance should have decreased by the actual fee and not by the max fee
      await expect(t.getBananaPrivateBalanceFn(bobsAddress)).resolves.toEqual([mintedBananas - actualFee]);

      // the FPC admin (set to sequencer) got the banana fee note so his private balance should have increased by the actual fee
      await expect(t.getBananaPrivateBalanceFn(t.sequencerAddress)).resolves.toEqual([
        sequencerInitialPrivateBananas + actualFee,
      ]);

      // the FPC should have been the fee payer
      await expect(t.getGasBalanceFn(bananaFPC.address)).resolves.toEqual([fpcsInitialGas - actualFee]);
    });

    it('pays publicly through an FPC', async () => {
      const mintedBananas = FEE_FUNDING_FOR_TESTER_ACCOUNT;
      await bananaCoin.methods.mint_to_public(bobsAddress, mintedBananas).send().wait();

      const paymentMethod = new PublicFeePaymentMethod(bananaFPC.address, bobsWallet);
      const tx = await bobsAccountManager
        .deploy({
          skipPublicDeployment: false,
          fee: { gasSettings, paymentMethod },
        })
        .wait();

      const actualFee = tx.transactionFee!;
      expect(actualFee).toBeGreaterThan(0n);

      // we should have paid the fee to the FPC
      await expect(t.getBananaPublicBalanceFn(bobsAddress, bananaFPC.address)).resolves.toEqual([
        mintedBananas - actualFee,
        fpcsInitialPublicBananas + actualFee,
      ]);

      // the FPC should have paid the sequencer
      await expect(t.getGasBalanceFn(bananaFPC.address)).resolves.toEqual([fpcsInitialGas - actualFee]);
    });
  });

  describe('another account pays the fee', () => {
    it('pays natively in the Fee Juice', async () => {
      // mint Fee Juice to alice
      await t.mintAndBridgeFeeJuice(aliceAddress, FEE_FUNDING_FOR_TESTER_ACCOUNT);
      const [alicesInitialGas] = await t.getGasBalanceFn(aliceAddress);

      // bob generates the private keys for his account on his own
      const bobsPublicKeys = deriveKeys(bobsSecretKey).publicKeys;
      const bobsSigningPubKey = new Schnorr().computePublicKey(bobsPrivateSigningKey);
      const bobsInstance = bobsAccountManager.getInstance();

      // and deploys bob's account, paying the fee from her balance
      const paymentMethod = new FeeJuicePaymentMethod(aliceAddress);
      const tx = await SchnorrAccountContract.deployWithPublicKeys(
        bobsPublicKeys,
        aliceWallet,
        bobsSigningPubKey.x,
        bobsSigningPubKey.y,
      )
        .send({
          contractAddressSalt: bobsInstance.salt,
          skipClassRegistration: true,
          skipPublicDeployment: true,
          skipInitialization: false,
          universalDeploy: true,
          fee: { gasSettings, paymentMethod },
        })
        .wait();

      // alice paid in Fee Juice
      expect(tx.transactionFee!).toBeGreaterThan(0n);
      await expect(t.getGasBalanceFn(aliceAddress)).resolves.toEqual([alicesInitialGas - tx.transactionFee!]);

      // bob can now use his wallet for sending txs
      await bananaCoin
        .withWallet(bobsWallet)
        .methods.transfer_in_public(bobsAddress, aliceAddress, 0n, 0n)
        .send()
        .wait();
    });
  });
});
