import { type AccountWallet, Fr, type Logger } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec.js/testing';
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
    const priceFeedContract = await PriceFeedContract.deploy(wallet).send().deployed();
    logger.info(`Price feed deployed to ${priceFeedContract.address}`);

    logger.info(`Deploying collateral asset feed contract...`);
    const collateralAsset = await TokenContract.deploy(wallet, wallet.getAddress(), 'TokenName', 'TokenSymbol', 18)
      .send()
      .deployed();
    logger.info(`Collateral asset deployed to ${collateralAsset.address}`);

    logger.info(`Deploying stable coin contract...`);
    const stableCoin = await TokenContract.deploy(wallet, wallet.getAddress(), 'TokenName', 'TokenSymbol', 18)
      .send()
      .deployed();
    logger.info(`Stable coin asset deployed to ${stableCoin.address}`);

    logger.info(`Deploying L2 public contract...`);
    const lendingContract = await LendingContract.deploy(wallet).send().deployed();
    logger.info(`CDP deployed at ${lendingContract.address}`);

    await collateralAsset.methods.set_minter(lendingContract.address, true).send().wait();
    await stableCoin.methods.set_minter(lendingContract.address, true).send().wait();

    return { priceFeedContract, lendingContract, collateralAsset, stableCoin };
  };

  beforeAll(async () => {
    const ctx = await setup(1);
    ({ teardown, logger, cheatCodes: cc, wallet, deployL1ContractsValues, dateProvider } = ctx);
    ({ lendingContract, priceFeedContract, collateralAsset, stableCoin } = await deployContracts());
    await ensureAccountContractsPublished(wallet, [wallet]);

    const rollup = new RollupContract(
      deployL1ContractsValues.l1Client,
      deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    );

    lendingAccount = new LendingAccount(wallet.getAddress(), new Fr(42));

    // Also specified in `noir-contracts/contracts/app/lending_contract/src/main.nr`
    const rate = 1268391679n;
    lendingSim = new LendingSimulator(
      cc,
      lendingAccount,
      rate,
      ctx.config.ethereumSlotDuration,
      rollup,
      lendingContract,
      new TokenSimulator(collateralAsset, wallet, logger, [lendingContract.address, wallet.getAddress()]),
      new TokenSimulator(stableCoin, wallet, logger, [lendingContract.address, wallet.getAddress()]),
    );
  }, 300_000);

  afterAll(() => teardown());

  afterEach(async () => {
    await lendingSim.check();
  });

  it('Mint assets for later usage', async () => {
    await priceFeedContract.methods
      .set_price(0n, 2n * 10n ** 9n)
      .send()
      .wait();

    {
      const assets = [collateralAsset, stableCoin];
      const mintAmount = 10000n;
      for (const asset of assets) {
        await Promise.all([
          asset.methods.mint_to_public(lendingAccount.address, mintAmount).send().wait(),
          mintTokensToPrivate(asset, wallet, lendingAccount.address, mintAmount),
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
      .send()
      .wait();
  });

  describe('Deposits', () => {
    it('Depositing 🥸 : 💰 -> 🏦', async () => {
      const depositAmount = 420n;
      const authwitNonce = Fr.random();
      const transferToPublicAuthwit = await wallet.createAuthWit({
        caller: lendingContract.address,
        action: collateralAsset.methods.transfer_to_public(
          lendingAccount.address,
          lendingContract.address,
          depositAmount,
          authwitNonce,
        ),
      });
      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.depositPrivate(lendingAccount.address, await lendingAccount.key(), depositAmount);

      // Make a private deposit of funds into own account.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the private collateral.
      logger.info('Depositing 🥸 : 💰 -> 🏦');
      await lendingContract.methods
        .deposit_private(
          lendingAccount.address,
          depositAmount,
          authwitNonce,
          lendingAccount.secret,
          0n,
          collateralAsset.address,
        )
        .send({ authWitnesses: [transferToPublicAuthwit] })
        .wait();
    });

    it('Depositing 🥸 on behalf of recipient: 💰 -> 🏦', async () => {
      const depositAmount = 421n;
      const authwitNonce = Fr.random();
      const transferToPublicAuthwit = await wallet.createAuthWit({
        caller: lendingContract.address,
        action: collateralAsset.methods.transfer_to_public(
          lendingAccount.address,
          lendingContract.address,
          depositAmount,
          authwitNonce,
        ),
      });

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.depositPrivate(lendingAccount.address, lendingAccount.address.toField(), depositAmount);
      // Make a private deposit of funds into another account, in this case, a public account.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public collateral.
      logger.info('Depositing 🥸 on behalf of recipient: 💰 -> 🏦');
      await lendingContract.methods
        .deposit_private(
          lendingAccount.address,
          depositAmount,
          authwitNonce,
          0n,
          lendingAccount.address,
          collateralAsset.address,
        )
        .send({ authWitnesses: [transferToPublicAuthwit] })
        .wait();
    });

    it('Depositing: 💰 -> 🏦', async () => {
      const depositAmount = 211n;

      const authwitNonce = Fr.random();

      // Add it to the wallet as approved
      const validateAction = await wallet.setPublicAuthWit(
        {
          caller: lendingContract.address,
          action: collateralAsset.methods.transfer_in_public(
            lendingAccount.address,
            lendingContract.address,
            depositAmount,
            authwitNonce,
          ),
        },
        true,
      );
      await validateAction.send().wait();

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider);
      lendingSim.depositPublic(lendingAccount.address, lendingAccount.address.toField(), depositAmount);

      // Make a public deposit of funds into self.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public collateral.

      logger.info('Depositing: 💰 -> 🏦');
      await lendingContract.methods
        .deposit_public(depositAmount, authwitNonce, lendingAccount.address, collateralAsset.address)
        .send()
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
        .send()
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
      await lendingContract.methods.borrow_public(lendingAccount.address, borrowAmount).send().wait();
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
        .send({ authWitnesses: [burnPrivateAuthwit] })
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
        .send({ authWitnesses: [burnPrivateAuthwit] })
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
      await validateAction.send().wait();

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
        .send()
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
      await lendingContract.methods.withdraw_public(lendingAccount.address, withdrawAmount).send().wait();
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
        .send()
        .wait();
    });

    describe('failure cases', () => {
      it('withdraw more than possible to revert', async () => {
        // Withdraw more than possible to test the revert.
        logger.info('Withdraw: trying to withdraw more than possible');
        await expect(
          lendingContract.methods.withdraw_public(lendingAccount.address, 10n ** 9n).simulate(),
        ).rejects.toThrow();
      });
    });
  });
});
