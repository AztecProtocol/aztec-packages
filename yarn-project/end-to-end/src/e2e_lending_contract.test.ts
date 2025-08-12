import { type AccountWallet, AztecAddress, Fr, type Logger } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec/testing';
import { type DeployL1ContractsReturnType, RollupContract } from '@aztec/ethereum';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { LendingContract } from '@aztec/noir-contracts.js/Lending';
import { PriceFeedContract } from '@aztec/noir-contracts.js/PriceFeed';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { afterAll, jest } from '@jest/globals';

import { mintTokensToPrivate } from './fixtures/token_utils.js';
import { ensureAccountContractsPublished, setup } from './fixtures/utils.js';
import { LendingAccount, LendingSimulator, TokenSimulator } from './simulators/index.js';

describe('e2e_lending_contract', () => {
  jest.setTimeout(100_000);
  let wallet: AccountWallet;
  let defaultAccountAddress: AztecAddress;
  let deployL1ContractsValues: DeployL1ContractsReturnType;

  let logger: Logger;
  let teardown: () => Promise<void>;

  let cc: CheatCodes;
  const SLOT_JUMP = 10;

  let lendingContract: LendingContract;
  let priceFeedContract: PriceFeedContract;
  let collateralAsset: TokenContract;
  let stableCoin: TokenContract;

  let lendingAccount: LendingAccount;
  let lendingSim: LendingSimulator;
  let dateProvider: TestDateProvider | undefined;

  const deployContracts = async () => {
    logger.info(`Deploying price feed contract...`);
    const priceFeedContract = await PriceFeedContract.deploy(wallet).send({ from: defaultAccountAddress }).deployed();
    logger.info(`Price feed deployed to ${priceFeedContract.address}`);

    logger.info(`Deploying collateral asset feed contract...`);
    const collateralAsset = await TokenContract.deploy(wallet, defaultAccountAddress, 'TokenName', 'TokenSymbol', 18)
      .send({ from: defaultAccountAddress })
      .deployed();
    logger.info(`Collateral asset deployed to ${collateralAsset.address}`);

    logger.info(`Deploying stable coin contract...`);
    const stableCoin = await TokenContract.deploy(wallet, defaultAccountAddress, 'TokenName', 'TokenSymbol', 18)
      .send({ from: defaultAccountAddress })
      .deployed();
    logger.info(`Stable coin asset deployed to ${stableCoin.address}`);

    logger.info(`Deploying L2 public contract...`);
    const lendingContract = await LendingContract.deploy(wallet).send({ from: defaultAccountAddress }).deployed();
    logger.info(`CDP deployed at ${lendingContract.address}`);

    await collateralAsset.methods
      .set_minter(lendingContract.address, true)
      .send({ from: defaultAccountAddress })
      .wait();
    await stableCoin.methods.set_minter(lendingContract.address, true).send({ from: defaultAccountAddress }).wait();

    return { priceFeedContract, lendingContract, collateralAsset, stableCoin };
  };

  beforeAll(async () => {
    const ctx = await setup(1);
    ({
      teardown,
      logger,
      cheatCodes: cc,
      wallet,
      deployL1ContractsValues,
      dateProvider,
      accounts: [defaultAccountAddress],
    } = ctx);
    ({ lendingContract, priceFeedContract, collateralAsset, stableCoin } = await deployContracts());
    await ensureAccountContractsPublished(wallet, [wallet]);

    const rollup = new RollupContract(
      deployL1ContractsValues.l1Client,
      deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    );

    lendingAccount = new LendingAccount(defaultAccountAddress, new Fr(42));

    // Also specified in `noir-contracts/contracts/app/lending_contract/src/main.nr`
    const rate = 1268391679n;
    lendingSim = new LendingSimulator(
      cc,
      lendingAccount,
      rate,
      ctx.config.ethereumSlotDuration,
      rollup,
      lendingContract,
      new TokenSimulator(collateralAsset, wallet, defaultAccountAddress, logger, [
        lendingContract.address,
        defaultAccountAddress,
      ]),
      new TokenSimulator(stableCoin, wallet, defaultAccountAddress, logger, [
        lendingContract.address,
        defaultAccountAddress,
      ]),
    );
  }, 300_000);

  afterAll(() => teardown());

  afterEach(async () => {
    await lendingSim.check();
  });

  it('Mint assets for later usage', async () => {
    await priceFeedContract.methods
      .set_price(0n, 2n * 10n ** 9n)
      .send({ from: defaultAccountAddress })
      .wait();

    {
      const assets = [collateralAsset, stableCoin];
      const mintAmount = 10000n;
      for (const asset of assets) {
        await Promise.all([
          asset.methods.mint_to_public(lendingAccount.address, mintAmount).send({ from: defaultAccountAddress }).wait(),
          mintTokensToPrivate(asset, defaultAccountAddress, wallet, lendingAccount.address, mintAmount),
        ]);
      }
    }

    lendingSim.mintStableCoinOutsideLoan(lendingAccount.address, 10000n, true);
    lendingSim.mintStableCoinOutsideLoan(lendingAccount.address, 10000n, false);

    lendingSim.collateralAsset.mintPrivate(lendingAccount.address, 10000n);
    lendingSim.collateralAsset.mintPublic(lendingAccount.address, 10000n);
  });

  it('Initialize the contract', async () => {
    await lendingSim.prepare();
    logger.info('Initializing contract');
    await lendingContract.methods
      .init(priceFeedContract.address, 8000, collateralAsset.address, stableCoin.address)
      .send({ from: defaultAccountAddress })
      .wait();
  });

  describe('Deposits', () => {
    it('Depositing 🥸 : 💰 -> 🏦', async () => {
      const activationThreshold = 420n;
      const authwitNonce = Fr.random();
      const transferToPublicAuthwit = await wallet.createAuthWit({
        caller: lendingContract.address,
        action: collateralAsset.methods.transfer_to_public(
          lendingAccount.address,
          lendingContract.address,
          activationThreshold,
          authwitNonce,
        ),
      });
      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.depositPrivate(lendingAccount.address, await lendingAccount.key(), activationThreshold);

      // Make a private deposit of funds into own account.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the private collateral.
      logger.info('Depositing 🥸 : 💰 -> 🏦');
      await lendingContract.methods
        .deposit_private(
          lendingAccount.address,
          activationThreshold,
          authwitNonce,
          lendingAccount.secret,
          0n,
          collateralAsset.address,
        )
        .send({ from: defaultAccountAddress, authWitnesses: [transferToPublicAuthwit] })
        .wait();
    });

    it('Depositing 🥸 on behalf of recipient: 💰 -> 🏦', async () => {
      const activationThreshold = 421n;
      const authwitNonce = Fr.random();
      const transferToPublicAuthwit = await wallet.createAuthWit({
        caller: lendingContract.address,
        action: collateralAsset.methods.transfer_to_public(
          lendingAccount.address,
          lendingContract.address,
          activationThreshold,
          authwitNonce,
        ),
      });

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.depositPrivate(lendingAccount.address, lendingAccount.address.toField(), activationThreshold);
      // Make a private deposit of funds into another account, in this case, a public account.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public collateral.
      logger.info('Depositing 🥸 on behalf of recipient: 💰 -> 🏦');
      await lendingContract.methods
        .deposit_private(
          lendingAccount.address,
          activationThreshold,
          authwitNonce,
          0n,
          lendingAccount.address,
          collateralAsset.address,
        )
        .send({ from: defaultAccountAddress, authWitnesses: [transferToPublicAuthwit] })
        .wait();
    });

    it('Depositing: 💰 -> 🏦', async () => {
      const activationThreshold = 211n;

      const authwitNonce = Fr.random();

      // Add it to the wallet as approved
      const validateAction = await wallet.setPublicAuthWit(
        {
          caller: lendingContract.address,
          action: collateralAsset.methods.transfer_in_public(
            lendingAccount.address,
            lendingContract.address,
            activationThreshold,
            authwitNonce,
          ),
        },
        true,
      );
      await validateAction.send({ from: defaultAccountAddress }).wait();

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.depositPublic(lendingAccount.address, lendingAccount.address.toField(), activationThreshold);

      // Make a public deposit of funds into self.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public collateral.

      logger.info('Depositing: 💰 -> 🏦');
      await lendingContract.methods
        .deposit_public(activationThreshold, authwitNonce, lendingAccount.address, collateralAsset.address)
        .send({ from: defaultAccountAddress })
        .wait();
    });
  });

  describe('Borrow', () => {
    it('Borrow 🥸 : 🏦 -> 🍌', async () => {
      const borrowAmount = 69n;
      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.borrow(await lendingAccount.key(), lendingAccount.address, borrowAmount);

      // Make a private borrow using the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the private debt.

      logger.info('Borrow 🥸 : 🏦 -> 🍌');
      await lendingContract.methods
        .borrow_private(lendingAccount.secret, lendingAccount.address, borrowAmount)
        .send({ from: defaultAccountAddress })
        .wait();
    });

    it('Borrow: 🏦 -> 🍌', async () => {
      const borrowAmount = 69n;
      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.borrow(lendingAccount.address.toField(), lendingAccount.address, borrowAmount);

      // Make a public borrow using the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public debt.

      logger.info('Borrow: 🏦 -> 🍌');
      await lendingContract.methods
        .borrow_public(lendingAccount.address, borrowAmount)
        .send({ from: defaultAccountAddress })
        .wait();
    });
  });

  describe('Repay', () => {
    it('Repay 🥸 : 🍌 -> 🏦', async () => {
      const repayAmount = 20n;
      const authwitNonce = Fr.random();
      const burnPrivateAuthwit = await wallet.createAuthWit({
        caller: lendingContract.address,
        action: stableCoin.methods.burn_private(lendingAccount.address, repayAmount, authwitNonce),
      });

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.repayPrivate(lendingAccount.address, await lendingAccount.key(), repayAmount);

      // Make a private repay of the debt in the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the private debt.

      logger.info('Repay 🥸 : 🍌 -> 🏦');
      await lendingContract.methods
        .repay_private(lendingAccount.address, repayAmount, authwitNonce, lendingAccount.secret, 0n, stableCoin.address)
        .send({ from: defaultAccountAddress, authWitnesses: [burnPrivateAuthwit] })
        .wait();
    });

    it('Repay 🥸  on behalf of public: 🍌 -> 🏦', async () => {
      const repayAmount = 21n;
      const authwitNonce = Fr.random();
      const burnPrivateAuthwit = await wallet.createAuthWit({
        caller: lendingContract.address,
        action: stableCoin.methods.burn_private(lendingAccount.address, repayAmount, authwitNonce),
      });

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.repayPrivate(lendingAccount.address, lendingAccount.address.toField(), repayAmount);

      // Make a private repay of the debt in the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public debt.

      logger.info('Repay 🥸  on behalf of public: 🍌 -> 🏦');
      await lendingContract.methods
        .repay_private(
          lendingAccount.address,
          repayAmount,
          authwitNonce,
          0n,
          lendingAccount.address,
          stableCoin.address,
        )
        .send({ from: defaultAccountAddress, authWitnesses: [burnPrivateAuthwit] })
        .wait();
    });

    it('Repay: 🍌 -> 🏦', async () => {
      const repayAmount = 20n;
      const authwitNonce = Fr.random();

      // Add it to the wallet as approved
      const validateAction = await wallet.setPublicAuthWit(
        {
          caller: lendingContract.address,
          action: stableCoin.methods.burn_public(lendingAccount.address, repayAmount, authwitNonce),
        },
        true,
      );
      await validateAction.send({ from: defaultAccountAddress }).wait();

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.repayPublic(lendingAccount.address, lendingAccount.address.toField(), repayAmount);

      // Make a public repay of the debt in the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public debt.

      logger.info('Repay: 🍌 -> 🏦');
      await lendingContract.methods
        .repay_public(repayAmount, authwitNonce, lendingAccount.address, stableCoin.address)
        .send({ from: defaultAccountAddress })
        .wait();
    });
  });

  describe('Withdraw', () => {
    it('Withdraw: 🏦 -> 💰', async () => {
      const withdrawAmount = 42n;
      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.withdraw(lendingAccount.address.toField(), lendingAccount.address, withdrawAmount);

      // Withdraw funds from the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public collateral.

      logger.info('Withdraw: 🏦 -> 💰');
      await lendingContract.methods
        .withdraw_public(lendingAccount.address, withdrawAmount)
        .send({ from: defaultAccountAddress })
        .wait();
    });

    it('Withdraw 🥸 : 🏦 -> 💰', async () => {
      const withdrawAmount = 42n;
      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.withdraw(await lendingAccount.key(), lendingAccount.address, withdrawAmount);

      // Withdraw funds from the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the private collateral.

      logger.info('Withdraw 🥸 : 🏦 -> 💰');
      await lendingContract.methods
        .withdraw_private(lendingAccount.secret, lendingAccount.address, withdrawAmount)
        .send({ from: defaultAccountAddress })
        .wait();
    });

    describe('failure cases', () => {
      it('withdraw more than possible to revert', async () => {
        // Withdraw more than possible to test the revert.
        logger.info('Withdraw: trying to withdraw more than possible');
        await expect(
          lendingContract.methods
            .withdraw_public(lendingAccount.address, 10n ** 9n)
            .simulate({ from: defaultAccountAddress }),
        ).rejects.toThrow();
      });
    });
  });
});
