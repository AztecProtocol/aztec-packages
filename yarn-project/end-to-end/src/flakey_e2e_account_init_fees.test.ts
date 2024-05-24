import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import {
  type AccountManager,
  type AztecNode,
  type DebugLogger,
  type DeployL1Contracts,
  ExtendedNote,
  Fr,
  NativeFeePaymentMethod,
  Note,
  type PXE,
  PrivateFeePaymentMethod,
  PublicFeePaymentMethod,
  Schnorr,
  type TxHash,
  TxStatus,
  type Wallet,
  computeSecretHash,
  deriveKeys,
} from '@aztec/aztec.js';
import { type AztecAddress, CompleteAddress, Fq, GasSettings } from '@aztec/circuits.js';
import {
  TokenContract as BananaCoin,
  FPCContract,
  type GasTokenContract,
  SchnorrAccountContract,
} from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { type BalancesFn, expectMapping, getBalancesFn, publicDeployAccounts, setup } from './fixtures/utils.js';
import { GasPortalTestingHarnessFactory, type IGasBridgingTestHarness } from './shared/gas_portal_test_harness.js';

const TOKEN_NAME = 'BananaCoin';
const TOKEN_SYMBOL = 'BC';
const TOKEN_DECIMALS = 18n;
const BRIDGED_FPC_GAS = BigInt(10e12);

jest.setTimeout(1_000_000);

describe('e2e_fees_account_init', () => {
  let logger: DebugLogger;
  let aztecNode: AztecNode;
  let pxe: PXE;
  let teardown: () => Promise<void>;

  let sequencer: Wallet;
  let sequencersAddress: AztecAddress;
  let alice: Wallet;

  let gas: GasTokenContract;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;

  let gasBridgeTestHarness: IGasBridgingTestHarness;

  let gasBalances: BalancesFn;
  let bananaPublicBalances: BalancesFn;
  let bananaPrivateBalances: BalancesFn;

  let bobsSecretKey: Fr;
  let bobsPrivateSigningKey: Fq;
  let bobsAccountManager: AccountManager;
  let bobsAddress: AztecAddress;

  let bobsInitialGas: bigint;
  let alicesInitialGas: bigint;
  let sequencersInitialGas: bigint;
  let fpcsInitialGas: bigint;
  let fpcsInitialPublicBananas: bigint;

  let gasSettings: GasSettings;
  let maxFee: bigint;
  let actualFee: bigint;

  // run this after each test's setup phase to get the initial balances
  async function initBalances() {
    [[bobsInitialGas, alicesInitialGas, sequencersInitialGas, fpcsInitialGas], [fpcsInitialPublicBananas]] =
      await Promise.all([
        gasBalances(bobsAddress, alice.getAddress(), sequencersAddress, bananaFPC.address),
        bananaPublicBalances(bananaFPC.address),
      ]);
  }

  beforeAll(async () => {
    let wallets: Wallet[];
    let wallet: Wallet;
    let deployL1ContractsValues: DeployL1Contracts;
    ({ logger, wallets, wallet, aztecNode, pxe, deployL1ContractsValues } = await setup(2, {}, {}, true));
    [sequencer, alice] = wallets;
    sequencersAddress = sequencer.getAddress();

    await aztecNode.setConfig({
      feeRecipient: sequencersAddress,
    });

    gasBridgeTestHarness = await GasPortalTestingHarnessFactory.create({
      aztecNode,
      pxeService: pxe,
      publicClient: deployL1ContractsValues.publicClient,
      walletClient: deployL1ContractsValues.walletClient,
      wallet,
      logger,
      mockL1: false,
    });

    gas = gasBridgeTestHarness.l2Token;

    bananaCoin = await BananaCoin.deploy(sequencer, sequencersAddress, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS)
      .send()
      .deployed();

    logger.verbose(`BananaCoin deployed at ${bananaCoin.address}`);

    bananaFPC = await FPCContract.deploy(sequencer, bananaCoin.address, gas.address).send().deployed();
    logger.verbose(`bananaPay deployed at ${bananaFPC.address}`);
    await publicDeployAccounts(sequencer, [sequencer]);

    await gasBridgeTestHarness.bridgeFromL1ToL2(BRIDGED_FPC_GAS, BRIDGED_FPC_GAS, bananaFPC.address);

    bananaPublicBalances = getBalancesFn('🍌.public', bananaCoin.methods.balance_of_public, logger);
    bananaPrivateBalances = getBalancesFn('🍌.private', bananaCoin.methods.balance_of_private, logger);
    gasBalances = getBalancesFn('⛽', gas.methods.balance_of_public, logger);
  });

  afterAll(() => teardown());

  beforeEach(() => {
    gasSettings = GasSettings.default();
    maxFee = gasSettings.getFeeLimit().toBigInt();
    actualFee = 1n;
    bobsSecretKey = Fr.random();
    bobsPrivateSigningKey = Fq.random();
    bobsAccountManager = getSchnorrAccount(pxe, bobsSecretKey, bobsPrivateSigningKey, Fr.random());
    bobsAddress = bobsAccountManager.getCompleteAddress().address;
  });

  describe('account pays its own fee', () => {
    describe('in the gas token', () => {
      beforeEach(async () => {
        await gasBridgeTestHarness.bridgeFromL1ToL2(BRIDGED_FPC_GAS, BRIDGED_FPC_GAS, bobsAddress);
      });

      beforeEach(initBalances);

      it('account pays for its own fee', async () => {
        await bobsAccountManager
          .deploy({
            fee: {
              gasSettings,
              paymentMethod: new NativeFeePaymentMethod(bobsAddress),
            },
          })
          .wait();

        await expectMapping(
          gasBalances,
          [bobsAddress, sequencersAddress],
          [bobsInitialGas - actualFee, sequencersInitialGas + actualFee],
        );
      });
    });

    describe('privately through an FPC', () => {
      let mintedPrivateBananas: bigint;
      beforeEach(async () => {
        mintedPrivateBananas = BigInt(1e12);

        // TODO the following sequence of events ends in a timeout
        // 1. pxe.registerRecipient (aka just add the public key so pxe can encrypt notes)
        // 2. mint note for mew account
        // 3. accountManager.register (add pubkey + start a note processor)
        // as a workaround, register (pubkey + note processors) the account first, before minting the note
        await bobsAccountManager.register();

        const secret = Fr.random();
        const secretHash = computeSecretHash(secret);
        const mintTx = await bananaCoin.methods.mint_private(mintedPrivateBananas, secretHash).send().wait();
        await addTransparentNoteToPxe(sequencersAddress, mintedPrivateBananas, secretHash, mintTx.txHash);

        // at this point, the new account owns a note
        // but the account doesn't have a NoteProcessor registered
        // so the note exists on the blockchain as an encrypted blob
        // tell the pxe to start a note processor for the account ahead of its deployment
        await bananaCoin.methods.redeem_shield(bobsAddress, mintedPrivateBananas, secret).send().wait();
      });

      beforeEach(initBalances);

      it('account pays for its own fee', async () => {
        const rebateSecret = Fr.random();
        const tx = await bobsAccountManager
          .deploy({
            fee: {
              gasSettings,
              paymentMethod: new PrivateFeePaymentMethod(
                bananaCoin.address,
                bananaFPC.address,
                await bobsAccountManager.getWallet(),
                rebateSecret,
              ),
            },
          })
          .wait();

        expect(tx.status).toEqual(TxStatus.SUCCESS);

        // the new account should have paid the full fee to the FPC
        await expect(bananaPrivateBalances(bobsAddress)).resolves.toEqual([mintedPrivateBananas - maxFee]);

        // the FPC got paid through "unshield", so it's got a new public balance
        await expect(bananaPublicBalances(bananaFPC.address)).resolves.toEqual([fpcsInitialPublicBananas + actualFee]);

        // the FPC should have paid the sequencer
        await expect(gasBalances(bananaFPC.address, sequencersAddress)).resolves.toEqual([
          fpcsInitialGas - actualFee,
          sequencersInitialGas + actualFee,
        ]);

        // the new account should have received a refund
        await expect(
          // this rejects if note can't be added
          addTransparentNoteToPxe(bobsAddress, maxFee - actualFee, computeSecretHash(rebateSecret), tx.txHash),
        ).resolves.toBeUndefined();

        // and it can redeem the refund
        await bananaCoin.methods
          .redeem_shield(bobsAccountManager.getCompleteAddress().address, maxFee - actualFee, rebateSecret)
          .send()
          .wait();

        await expect(bananaPrivateBalances(bobsAccountManager.getCompleteAddress().address)).resolves.toEqual([
          mintedPrivateBananas - actualFee,
        ]);
      });
    });

    describe('public through an FPC', () => {
      let mintedPublicBananas: bigint;

      beforeEach(async () => {
        mintedPublicBananas = BigInt(1e12);
        await bananaCoin.methods.mint_public(bobsAddress, mintedPublicBananas).send().wait();
      });

      beforeEach(initBalances);

      it('account pays for its own fee', async () => {
        const tx = await bobsAccountManager
          .deploy({
            skipPublicDeployment: false,
            fee: {
              gasSettings,
              paymentMethod: new PublicFeePaymentMethod(
                bananaCoin.address,
                bananaFPC.address,
                await bobsAccountManager.getWallet(),
              ),
            },
          })
          .wait();

        expect(tx.status).toEqual(TxStatus.SUCCESS);

        // we should have paid the fee to the FPC
        await expect(
          bananaPublicBalances(bobsAccountManager.getCompleteAddress().address, bananaFPC.address),
        ).resolves.toEqual([mintedPublicBananas - actualFee, fpcsInitialPublicBananas + actualFee]);

        // the FPC should have paid the sequencer
        await expect(gasBalances(bananaFPC.address, sequencersAddress)).resolves.toEqual([
          fpcsInitialGas - actualFee,
          sequencersInitialGas + actualFee,
        ]);
      });
    });
  });

  describe('another account pays the fee', () => {
    describe('in the gas token', () => {
      beforeEach(async () => {
        await gasBridgeTestHarness.bridgeFromL1ToL2(BRIDGED_FPC_GAS, BRIDGED_FPC_GAS, alice.getAddress());
      });

      beforeEach(initBalances);

      it("alice pays for bob's account", async () => {
        // bob generates the private keys for his account on his own
        const instance = bobsAccountManager.getInstance();

        // and gives the public keys to alice
        const signingPubKey = new Schnorr().computePublicKey(bobsPrivateSigningKey);
        const completeAddress = CompleteAddress.fromSecretKeyAndInstance(bobsSecretKey, instance);

        // alice registers the keys in the PXE
        await pxe.registerRecipient(completeAddress);

        // and deploys bob's account, paying the fee from her balance
        const publicKeysHash = deriveKeys(bobsSecretKey).publicKeys.hash();
        const tx = await SchnorrAccountContract.deployWithPublicKeysHash(
          publicKeysHash,
          alice,
          signingPubKey.x,
          signingPubKey.y,
        )
          .send({
            contractAddressSalt: instance.salt,
            skipClassRegistration: true,
            skipPublicDeployment: true,
            skipInitialization: false,
            universalDeploy: true,
            fee: {
              gasSettings,
              paymentMethod: new NativeFeePaymentMethod(alice.getAddress()),
            },
          })
          .wait();

        expect(tx.status).toBe(TxStatus.SUCCESS);

        await expectMapping(
          gasBalances,
          [alice.getAddress(), bobsAddress, sequencersAddress],
          [alicesInitialGas - actualFee, bobsInitialGas, sequencersInitialGas + actualFee],
        );

        // bob can now use his wallet
        const bobsWallet = await bobsAccountManager.getWallet();
        await expect(gas.withWallet(bobsWallet).methods.balance_of_public(alice.getAddress()).simulate()).resolves.toBe(
          alicesInitialGas - actualFee,
        );
      });
    });
  });

  async function addTransparentNoteToPxe(owner: AztecAddress, amount: bigint, secretHash: Fr, txHash: TxHash) {
    const storageSlot = bananaCoin.artifact.storageLayout['pending_shields'].slot;
    const noteTypeId = bananaCoin.artifact.notes['TransparentNote'].id;

    const note = new Note([new Fr(amount), secretHash]);
    // this note isn't encrypted but we need to provide a registered public key
    const extendedNote = new ExtendedNote(note, owner, bananaCoin.address, storageSlot, noteTypeId, txHash);
    await pxe.addNote(extendedNote);
  }
});
