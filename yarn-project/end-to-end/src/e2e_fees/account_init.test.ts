import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import {
  AccountManager,
  type AztecNode,
  CompleteAddress,
  DeployAccountMethod,
  FeeJuicePaymentMethodWithClaim,
  Fr,
  type Logger,
  PrivateFeePaymentMethod,
  PublicFeePaymentMethod,
  Schnorr,
  deriveKeys,
} from '@aztec/aztec.js';
import { Fq } from '@aztec/foundation/fields';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { SchnorrAccountContract as SchnorrAccountContractInterface } from '@aztec/noir-contracts.js/SchnorrAccount';
import type { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasSettings } from '@aztec/stdlib/gas';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';

import { FeesTest } from './fees_test.js';

jest.setTimeout(300_000);

describe('e2e_fees account_init', () => {
  const t = new FeesTest('account_init', 1);

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFundAliceWithBananas();
    await t.applyFPCSetupSnapshot();
    ({ aliceAddress, wallet, bananaCoin, bananaFPC, logger, aztecNode } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let logger: Logger;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;

  let wallet: TestWallet;
  let aztecNode: AztecNode;

  // Alice pays for deployments when we need someone else to intervene
  let aliceAddress: AztecAddress;

  // Bob is the account being created (a fresh account is generated for each test)
  let bobsSecretKey: Fr;
  let bobsPrivateSigningKey: Fq;
  let bobsAccountManager: AccountManager;
  let bobsDeployMethod: DeployAccountMethod;
  let bobsCompleteAddress: CompleteAddress;
  let bobsAddress: AztecAddress;
  let bobsSalt: Fr;

  // Seeded by initBalances below in a beforeEach hook
  let fpcsInitialGas: bigint;
  let fpcsInitialPublicBananas: bigint;

  async function initBalances() {
    [[fpcsInitialGas], [fpcsInitialPublicBananas]] = await Promise.all([
      t.getGasBalanceFn(bananaFPC.address),
      t.getBananaPublicBalanceFn(bananaFPC.address),
    ]);
  }

  beforeEach(async () => {
    bobsSecretKey = Fr.random();
    bobsPrivateSigningKey = Fq.random();
    bobsSalt = Fr.random();
    bobsAccountManager = await wallet.createAccount({
      secret: bobsSecretKey,
      salt: bobsSalt,
      contract: new SchnorrAccountContract(bobsPrivateSigningKey),
    });
    bobsDeployMethod = await bobsAccountManager.getDeployMethod();
    bobsCompleteAddress = await bobsAccountManager.getCompleteAddress();
    bobsAddress = bobsCompleteAddress.address;

    await initBalances();
  });

  describe('account pays its own fee', () => {
    it('pays natively in the Fee Juice after Alice bridges funds', async () => {
      const mintAmount = await t.feeJuiceBridgeTestHarness.l1TokenManager.getMintAmount();
      await t.mintAndBridgeFeeJuice(aliceAddress, bobsAddress);
      const [bobsInitialGas] = await t.getGasBalanceFn(bobsAddress);
      expect(bobsInitialGas).toEqual(mintAmount);

      const tx = await bobsDeployMethod.send({ from: AztecAddress.ZERO }).wait();

      expect(tx.transactionFee!).toBeGreaterThan(0n);
      await expect(t.getGasBalanceFn(bobsAddress)).resolves.toEqual([bobsInitialGas - tx.transactionFee!]);
    });

    it('pays natively in the Fee Juice by bridging funds themselves', async () => {
      const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(bobsAddress);
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(bobsAddress, claim);
      const tx = await bobsDeployMethod.send({ from: AztecAddress.ZERO, fee: { paymentMethod } }).wait();
      expect(tx.transactionFee!).toBeGreaterThan(0n);
      await expect(t.getGasBalanceFn(bobsAddress)).resolves.toEqual([claim.claimAmount - tx.transactionFee!]);
    });

    it('pays privately through an FPC', async () => {
      // Alice mints bananas to Bob
      const mintedBananas = await t.feeJuiceBridgeTestHarness.l1TokenManager.getMintAmount();
      await t.mintPrivateBananas(mintedBananas, bobsAddress);

      // Bob deploys his account through the private FPC
      // The private fee paying method assembled on the app side requires knowledge of the maximum
      // fee the user is willing to pay
      const maxFeesPerGas = (await aztecNode.getCurrentBaseFees()).mul(1.5);
      const gasSettings = GasSettings.default({ maxFeesPerGas });
      const paymentMethod = new PrivateFeePaymentMethod(bananaFPC.address, bobsAddress, wallet, gasSettings);
      const tx = await bobsDeployMethod.send({ from: AztecAddress.ZERO, fee: { paymentMethod } }).wait();
      const actualFee = tx.transactionFee!;
      expect(actualFee).toBeGreaterThan(0n);

      // We have gotten a refund note so our balance should have decreased by the actual fee and not by the max fee
      await expect(t.getBananaPrivateBalanceFn(bobsAddress)).resolves.toEqual([mintedBananas - actualFee]);

      // the FPC admin (set to sequencer) got the banana fee note so his private balance should have increased by the actual fee
      await expect(t.getBananaPublicBalanceFn(t.bananaFPC.address)).resolves.toEqual([
        fpcsInitialPublicBananas + actualFee,
      ]);

      // the FPC should have been the fee payer
      await expect(t.getGasBalanceFn(bananaFPC.address)).resolves.toEqual([fpcsInitialGas - actualFee]);
    });

    it('pays publicly through an FPC', async () => {
      const mintedBananas = await t.feeJuiceBridgeTestHarness.l1TokenManager.getMintAmount();
      await bananaCoin.methods.mint_to_public(bobsAddress, mintedBananas).send({ from: aliceAddress }).wait();

      // The public fee paying method assembled on the app side requires knowledge of the maximum
      // fee the user is willing to pay
      const maxFeesPerGas = (await aztecNode.getCurrentBaseFees()).mul(1.5);
      const gasSettings = GasSettings.default({ maxFeesPerGas });
      const paymentMethod = new PublicFeePaymentMethod(bananaFPC.address, bobsAddress, wallet, gasSettings);
      const tx = await bobsDeployMethod
        .send({
          from: AztecAddress.ZERO,
          skipInstancePublication: false,
          fee: { paymentMethod },
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
      // bob generates the private keys for his account on his own
      const bobsPublicKeys = (await deriveKeys(bobsSecretKey)).publicKeys;
      const bobsSigningPubKey = await new Schnorr().computePublicKey(bobsPrivateSigningKey);
      const bobsInstance = bobsAccountManager.getInstance();

      // Alice mints bananas to Bob and deploys bob's account, paying the fees from her balance.
      const mintedBananas = await t.feeJuiceBridgeTestHarness.l1TokenManager.getMintAmount();
      await t.mintPrivateBananas(mintedBananas, bobsAddress);

      const [aliceBalanceBefore] = await t.getGasBalanceFn(aliceAddress);
      const tx = await SchnorrAccountContractInterface.deployWithPublicKeys(
        bobsPublicKeys,
        wallet,
        bobsSigningPubKey.x,
        bobsSigningPubKey.y,
      )
        .send({
          from: aliceAddress,
          contractAddressSalt: bobsInstance.salt,
          skipClassPublication: true,
          skipInstancePublication: true,
          skipInitialization: false,
          universalDeploy: true,
        })
        .wait();

      // alice paid in Fee Juice
      expect(tx.transactionFee!).toBeGreaterThan(0n);
      const [aliceBalanceAfter] = await t.getGasBalanceFn(aliceAddress);
      expect(aliceBalanceAfter).toBe(aliceBalanceBefore - tx.transactionFee!);

      // bob can now use his wallet for sending txs
      const maxFeesPerGas = (await aztecNode.getCurrentBaseFees()).mul(1.5);
      const gasSettings = GasSettings.default({ maxFeesPerGas });
      const bobPaymentMethod = new PrivateFeePaymentMethod(bananaFPC.address, bobsAddress, wallet, gasSettings);
      await bananaCoin.methods
        .transfer_in_public(bobsAddress, aliceAddress, 0n, 0n)
        .send({ from: bobsAddress, fee: { paymentMethod: bobPaymentMethod } })
        .wait();
    });
  });
});
