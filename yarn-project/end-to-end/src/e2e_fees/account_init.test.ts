import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { NO_FROM } from '@aztec/aztec.js/account';
import { CompleteAddress } from '@aztec/aztec.js/addresses';
import { FeeJuicePaymentMethodWithClaim, PrivateFeePaymentMethod, PublicFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import { deriveKeys } from '@aztec/aztec.js/keys';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { AccountManager, DeployAccountMethod } from '@aztec/aztec.js/wallet';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { Fq } from '@aztec/foundation/curves/bn254';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { SchnorrAccountContract as SchnorrAccountContractInterface } from '@aztec/noir-contracts.js/SchnorrAccount';
import type { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Gas, GasSettings } from '@aztec/stdlib/gas';

import { jest } from '@jest/globals';

import { PIPELINING_SETUP_OPTS, getPaddedMaxFeesPerGas } from '../fixtures/fixtures.js';
import type { TestWallet } from '../test-wallet/test_wallet.js';
import { FeesTest } from './fees_test.js';

// FeesTest.setup + applyFundAliceWithBananas + applyFPCSetup chains many dependent txs which run at the
// ~24s/tx pipelined cadence, exceeding the default 5 min hook window.
jest.setTimeout(15 * 60 * 1000);

// Fee payment during account contract initialization. Uses FeesTest (prod sequencer, pipelining preset:
// ethSlot=4s, aztecSlot=12s, inboxLag=2, minTxsPerBlock=0), 1 account, fake in-proc prover node, and
// GasBridgingTestHarness for L1↔L2 fee-juice bridging via FeeJuicePortal.
describe('e2e_fees account_init', () => {
  const t = new FeesTest('account_init', 1);

  beforeAll(async () => {
    await t.setup({ ...PIPELINING_SETUP_OPTS });
    await t.applyFundAliceWithBananas();
    await t.applyFPCSetup();
    ({ aliceAddress, wallet, bananaCoin, bananaFPC, logger, aztecNode } = t);
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

  // Scenarios where the newly created account itself covers its own deployment fee.
  describe('account pays its own fee', () => {
    // Alice bridges fee juice to Bob's undeployed address via FeeJuicePortal, then Bob deploys his account
    // paying from that bridged balance. Asserts the balance decreases by exactly the transaction fee.
    it('pays natively in the Fee Juice after Alice bridges funds', async () => {
      const mintAmount = await t.feeJuiceBridgeTestHarness.l1TokenManager.getMintAmount();
      await t.mintAndBridgeFeeJuice(aliceAddress, bobsAddress);
      const [bobsInitialGas] = await t.getGasBalanceFn(bobsAddress);
      expect(bobsInitialGas).toEqual(mintAmount);

      const { receipt: tx } = await bobsDeployMethod.send({ from: NO_FROM });

      expect(tx.transactionFee!).toBeGreaterThan(0n);
      await expect(t.getGasBalanceFn(bobsAddress)).resolves.toEqual([bobsInitialGas - tx.transactionFee!]);
    });

    // Bob claims fee juice atomically in the same account-deployment tx via
    // FeeJuicePaymentMethodWithClaim. No pre-bridging required from Alice.
    it('pays natively in the Fee Juice by bridging funds themselves', async () => {
      const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(bobsAddress);
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(bobsAddress, claim);
      const { receipt: tx } = await bobsDeployMethod.send({
        from: NO_FROM,
        fee: { paymentMethod },
      });
      expect(tx.transactionFee!).toBeGreaterThan(0n);
      await expect(t.getGasBalanceFn(bobsAddress)).resolves.toEqual([claim.claimAmount - tx.transactionFee!]);
    });

    // Alice mints bananas to Bob's undeployed address; Bob deploys through the BananaCoin FPC using
    // PrivateFeePaymentMethod. Asserts the refund note reduces Bob's banana balance by the actual fee.
    it('pays privately through an FPC', async () => {
      // Alice mints bananas to Bob
      const mintedBananas = await t.feeJuiceBridgeTestHarness.l1TokenManager.getMintAmount();
      await t.mintPrivateBananas(mintedBananas, bobsAddress);

      // Bob deploys his account through the private FPC
      // The private fee paying method assembled on the app side requires knowledge of the maximum
      // fee the user is willing to pay
      const maxFeesPerGas = await getPaddedMaxFeesPerGas(aztecNode);
      const gasLimits = Gas.from((await aztecNode.getNodeInfo()).txsLimits.gas);
      const gasSettings = GasSettings.fallback({ gasLimits, maxFeesPerGas });
      const paymentMethod = new PrivateFeePaymentMethod(bananaFPC.address, bobsAddress, wallet, gasSettings);
      const { receipt: tx } = await bobsDeployMethod.send({
        from: NO_FROM,
        fee: { paymentMethod },
      });
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

    // Bob deploys using PublicFeePaymentMethod: Alice mints bananas to Bob's public balance, then Bob
    // deploys with the FPC deducting from that public balance. Asserts the FPC received the fee.
    it('pays publicly through an FPC', async () => {
      const mintedBananas = await t.feeJuiceBridgeTestHarness.l1TokenManager.getMintAmount();
      await bananaCoin.methods.mint_to_public(bobsAddress, mintedBananas).send({ from: aliceAddress });

      // The public fee paying method assembled on the app side requires knowledge of the maximum
      // fee the user is willing to pay
      const maxFeesPerGas = await getPaddedMaxFeesPerGas(aztecNode);
      const gasLimits = Gas.from((await aztecNode.getNodeInfo()).txsLimits.gas);
      const gasSettings = GasSettings.fallback({ gasLimits, maxFeesPerGas });
      const paymentMethod = new PublicFeePaymentMethod(bananaFPC.address, bobsAddress, wallet, gasSettings);
      const { receipt: tx } = await bobsDeployMethod.send({
        from: NO_FROM,
        skipClassPublication: false,
        skipInstancePublication: false,
        fee: { paymentMethod },
      });

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

  // Scenarios where a third party (Alice) sponsors the deployment fee for Bob's account.
  describe('another account pays the fee', () => {
    // Alice mints bananas to Bob, then deploys Bob's account on his behalf paying from her own fee-juice
    // balance. Bob's account is then used immediately to send a private FPC-paid tx.
    it('pays natively in the Fee Juice', async () => {
      // bob generates the private keys for his account on his own
      const bobsPublicKeys = (await deriveKeys(bobsSecretKey)).publicKeys;
      const bobsSigningPubKey = await new Schnorr().computePublicKey(bobsPrivateSigningKey);
      const bobsInstance = bobsAccountManager.getInstance();

      // Alice mints bananas to Bob and deploys bob's account, paying the fees from her balance.
      const mintedBananas = await t.feeJuiceBridgeTestHarness.l1TokenManager.getMintAmount();
      await t.mintPrivateBananas(mintedBananas, bobsAddress);

      const [aliceBalanceBefore] = await t.getGasBalanceFn(aliceAddress);
      const { receipt: tx } = await SchnorrAccountContractInterface.deploy(
        wallet,
        bobsSigningPubKey.x,
        bobsSigningPubKey.y,
        { salt: bobsInstance.salt, universalDeploy: true, publicKeys: bobsPublicKeys },
      ).send({
        from: aliceAddress,
        // The account constructor initializes storage vars that need the contract's own nullifier key, so we need to add it to scopes.
        additionalScopes: [bobsAddress],
        skipClassPublication: true,
        skipInstancePublication: true,
        skipInitialization: false,
      });

      // alice paid in Fee Juice
      expect(tx.transactionFee!).toBeGreaterThan(0n);
      const [aliceBalanceAfter] = await t.getGasBalanceFn(aliceAddress);
      expect(aliceBalanceAfter).toBe(aliceBalanceBefore - tx.transactionFee!);

      // bob can now use his wallet for sending txs
      const maxFeesPerGas = await getPaddedMaxFeesPerGas(aztecNode);
      const gasLimits = Gas.from((await aztecNode.getNodeInfo()).txsLimits.gas);
      const gasSettings = GasSettings.fallback({ gasLimits, maxFeesPerGas });
      const bobPaymentMethod = new PrivateFeePaymentMethod(bananaFPC.address, bobsAddress, wallet, gasSettings);
      await bananaCoin.methods
        .transfer_in_public(bobsAddress, aliceAddress, 0n, 0n)
        .send({ from: bobsAddress, fee: { paymentMethod: bobPaymentMethod } });
    });
  });
});
