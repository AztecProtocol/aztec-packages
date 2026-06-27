import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { CheatCodes } from '@aztec/aztec/testing';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { DeployAztecL1ContractsReturnType } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { BlockNumber } from '@aztec/foundation/branded-types';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { LendingContract } from '@aztec/noir-contracts.js/Lending';
import { PriceFeedContract } from '@aztec/noir-contracts.js/PriceFeed';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { afterAll, jest } from '@jest/globals';

import type { EndToEndContext } from '../../fixtures/setup.js';
import { mintTokensToPrivate } from '../../fixtures/token_utils.js';
import { ensureAuthRegistryPublished } from '../../fixtures/utils.js';
import { LendingAccount, LendingSimulator, TokenSimulator } from '../../simulators/index.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { AutomineTestContext } from '../automine_test_context.js';

// Covers the full lifecycle of the Lending contract (deposit, borrow, repay, withdraw) in both
// private (🥸) and public paths, with and without authorization witnesses. Uses a single automine
// node; LendingSimulator tracks expected state and verifies after each test. Note that the
// lendingSim.progressSlots calls advance slot time on the simulator (not L1 time directly).
describe('automine/token/lending', () => {
  jest.setTimeout(100_000);
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let deployL1ContractsValues: DeployAztecL1ContractsReturnType;
  let aztecNode: EndToEndContext['aztecNode'];

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
    const { contract: priceFeedContract } = await PriceFeedContract.deploy(wallet).send({
      from: defaultAccountAddress,
    });
    logger.info(`Price feed deployed to ${priceFeedContract.address}`);

    logger.info(`Deploying collateral asset feed contract...`);
    const { contract: collateralAsset } = await TokenContract.deploy(
      wallet,
      defaultAccountAddress,
      'TokenName',
      'TokenSymbol',
      18,
    ).send({ from: defaultAccountAddress });
    logger.info(`Collateral asset deployed to ${collateralAsset.address}`);

    logger.info(`Deploying stable coin contract...`);
    const { contract: stableCoin } = await TokenContract.deploy(
      wallet,
      defaultAccountAddress,
      'TokenName',
      'TokenSymbol',
      18,
    ).send({
      from: defaultAccountAddress,
    });
    logger.info(`Stable coin asset deployed to ${stableCoin.address}`);

    logger.info(`Deploying L2 public contract...`);
    const { contract: lendingContract } = await LendingContract.deploy(wallet).send({ from: defaultAccountAddress });
    logger.info(`CDP deployed at ${lendingContract.address}`);

    await collateralAsset.methods.set_minter(lendingContract.address, true).send({ from: defaultAccountAddress });
    await stableCoin.methods.set_minter(lendingContract.address, true).send({ from: defaultAccountAddress });

    return { priceFeedContract, lendingContract, collateralAsset, stableCoin };
  };

  beforeAll(async () => {
    const ctx = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context;
    ({
      teardown,
      logger,
      cheatCodes: cc,
      wallet,
      deployL1ContractsValues,
      dateProvider,
      aztecNode,
      accounts: [defaultAccountAddress],
    } = ctx);
    ({ lendingContract, priceFeedContract, collateralAsset, stableCoin } = await deployContracts());
    await ensureAuthRegistryPublished(wallet, defaultAccountAddress);

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

  const observeBlock = async (blockNumber: number | undefined) => {
    const block = await aztecNode.getBlock(BlockNumber(blockNumber!));
    lendingSim.observeBlockTimestamp(Number(block!.header.globalVariables.timestamp));
  };

  // Mints collateral and stable-coin tokens to lendingAccount in both public and private,
  // records the mints in the simulator, and sets the price feed to 2e9.
  it('Mint assets for later usage', async () => {
    await priceFeedContract.methods.set_price(0n, 2n * 10n ** 9n).send({ from: defaultAccountAddress });

    {
      const assets = [collateralAsset, stableCoin];
      const mintAmount = 10000n;
      for (const asset of assets) {
        await Promise.all([
          asset.methods.mint_to_public(lendingAccount.address, mintAmount).send({ from: defaultAccountAddress }),
          mintTokensToPrivate(asset, defaultAccountAddress, lendingAccount.address, mintAmount),
        ]);
      }
    }

    lendingSim.mintStableCoinOutsideLoan(lendingAccount.address, 10000n, true);
    lendingSim.mintStableCoinOutsideLoan(lendingAccount.address, 10000n, false);

    lendingSim.collateralAsset.mintPrivate(lendingAccount.address, 10000n);
    lendingSim.collateralAsset.mintPublic(lendingAccount.address, 10000n);
  });

  // Calls lending.init() to set price feed, LTV, and asset addresses; reads the block timestamp
  // to initialize lendingSim.time so it matches the on-chain accumulator.
  it('Initialize the contract', async () => {
    logger.info('Initializing contract');
    const { receipt } = await lendingContract.methods
      .init(priceFeedContract.address, 8000, collateralAsset.address, stableCoin.address)
      .send({ from: defaultAccountAddress });
    // init writes accumulator = BASE and last_updated_ts = block.timestamp.
    // Match that exactly without advancing the accumulator from the previous (zero) time.
    const block = await aztecNode.getBlock(BlockNumber(receipt.blockNumber!));
    lendingSim.prepare();
    lendingSim.time = Number(block!.header.globalVariables.timestamp);
  });

  // Covers private and public deposit paths into the lending collateral pool.
  describe('Deposits', () => {
    // Creates a transfer_to_public authwit, advances slots, calls deposit_private for own account,
    // and updates simulator state.
    it('Depositing 🥸 : 💰 -> 🏦', async () => {
      const activationThreshold = 420n;
      const authwitNonce = Fr.random();
      const transferToPublicAuthwit = await wallet.createAuthWit(defaultAccountAddress, {
        caller: lendingContract.address,
        action: collateralAsset.methods.transfer_to_public(
          lendingAccount.address,
          lendingContract.address,
          activationThreshold,
          authwitNonce,
        ),
      });
      await lendingSim.progressSlots(SLOT_JUMP, dateProvider, aztecNode);

      // Make a private deposit of funds into own account.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the private collateral.
      logger.info('Depositing 🥸 : 💰 -> 🏦');
      const { receipt } = await lendingContract.methods
        .deposit_private(
          lendingAccount.address,
          activationThreshold,
          authwitNonce,
          lendingAccount.secret,
          0n,
          collateralAsset.address,
        )
        .send({ from: defaultAccountAddress, authWitnesses: [transferToPublicAuthwit] });
      await observeBlock(receipt.blockNumber);
      lendingSim.depositPrivate(lendingAccount.address, await lendingAccount.key(), activationThreshold);
    });

    // Creates a transfer_to_public authwit, calls deposit_private on behalf of a public recipient,
    // and updates simulator state with the public key.
    it('Depositing 🥸 on behalf of recipient: 💰 -> 🏦', async () => {
      const activationThreshold = 421n;
      const authwitNonce = Fr.random();
      const transferToPublicAuthwit = await wallet.createAuthWit(defaultAccountAddress, {
        caller: lendingContract.address,
        action: collateralAsset.methods.transfer_to_public(
          lendingAccount.address,
          lendingContract.address,
          activationThreshold,
          authwitNonce,
        ),
      });

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider, aztecNode);
      // Make a private deposit of funds into another account, in this case, a public account.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public collateral.
      logger.info('Depositing 🥸 on behalf of recipient: 💰 -> 🏦');
      const { receipt } = await lendingContract.methods
        .deposit_private(
          lendingAccount.address,
          activationThreshold,
          authwitNonce,
          0n,
          lendingAccount.address,
          collateralAsset.address,
        )
        .send({ from: defaultAccountAddress, authWitnesses: [transferToPublicAuthwit] });
      await observeBlock(receipt.blockNumber);
      lendingSim.depositPrivate(lendingAccount.address, lendingAccount.address.toField(), activationThreshold);
    });

    // Sets a public authwit for transfer_in_public, calls deposit_public, and updates simulator.
    it('Depositing: 💰 -> 🏦', async () => {
      const activationThreshold = 211n;

      const authwitNonce = Fr.random();

      // Add it to the wallet as approved
      const validateAction = await wallet.setPublicAuthWit(
        defaultAccountAddress,
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
      await validateAction.send();

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider, aztecNode);

      // Make a public deposit of funds into self.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public collateral.

      logger.info('Depositing: 💰 -> 🏦');
      const { receipt } = await lendingContract.methods
        .deposit_public(activationThreshold, authwitNonce, lendingAccount.address, collateralAsset.address)
        .send({ from: defaultAccountAddress });
      await observeBlock(receipt.blockNumber);
      lendingSim.depositPublic(lendingAccount.address, lendingAccount.address.toField(), activationThreshold);
    });
  });

  // Covers private and public borrow paths from the lending pool.
  describe('Borrow', () => {
    // Advances slots, calls borrow_private using the lendingAccount secret, and updates simulator.
    it('Borrow 🥸 : 🏦 -> 🍌', async () => {
      const borrowAmount = 69n;
      await lendingSim.progressSlots(SLOT_JUMP, dateProvider, aztecNode);

      // Make a private borrow using the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the private debt.

      logger.info('Borrow 🥸 : 🏦 -> 🍌');
      const { receipt } = await lendingContract.methods
        .borrow_private(lendingAccount.secret, lendingAccount.address, borrowAmount)
        .send({ from: defaultAccountAddress });
      await observeBlock(receipt.blockNumber);
      lendingSim.borrow(await lendingAccount.key(), lendingAccount.address, borrowAmount);
    });

    // Advances slots, calls borrow_public using the lendingAccount public address, and updates
    // simulator state.
    it('Borrow: 🏦 -> 🍌', async () => {
      const borrowAmount = 69n;
      await lendingSim.progressSlots(SLOT_JUMP, dateProvider, aztecNode);

      // Make a public borrow using the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public debt.

      logger.info('Borrow: 🏦 -> 🍌');
      const { receipt } = await lendingContract.methods
        .borrow_public(lendingAccount.address, borrowAmount)
        .send({ from: defaultAccountAddress });
      await observeBlock(receipt.blockNumber);
      lendingSim.borrow(lendingAccount.address.toField(), lendingAccount.address, borrowAmount);
    });
  });

  // Covers private and public repayment paths back to the lending pool.
  describe('Repay', () => {
    // Creates a burn_private authwit, advances slots, calls repay_private for private debt, and
    // updates simulator.
    it('Repay 🥸 : 🍌 -> 🏦', async () => {
      const repayAmount = 20n;
      const authwitNonce = Fr.random();
      const burnPrivateAuthwit = await wallet.createAuthWit(defaultAccountAddress, {
        caller: lendingContract.address,
        action: stableCoin.methods.burn_private(lendingAccount.address, repayAmount, authwitNonce),
      });

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider, aztecNode);

      // Make a private repay of the debt in the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the private debt.

      logger.info('Repay 🥸 : 🍌 -> 🏦');
      const { receipt } = await lendingContract.methods
        .repay_private(lendingAccount.address, repayAmount, authwitNonce, lendingAccount.secret, 0n, stableCoin.address)
        .send({ from: defaultAccountAddress, authWitnesses: [burnPrivateAuthwit] });
      await observeBlock(receipt.blockNumber);
      lendingSim.repayPrivate(lendingAccount.address, await lendingAccount.key(), repayAmount);
    });

    // Creates a burn_private authwit, calls repay_private on behalf of the public account, and
    // updates simulator for the public debt path.
    it('Repay 🥸  on behalf of public: 🍌 -> 🏦', async () => {
      const repayAmount = 21n;
      const authwitNonce = Fr.random();
      const burnPrivateAuthwit = await wallet.createAuthWit(defaultAccountAddress, {
        caller: lendingContract.address,
        action: stableCoin.methods.burn_private(lendingAccount.address, repayAmount, authwitNonce),
      });

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider, aztecNode);

      // Make a private repay of the debt in the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public debt.

      logger.info('Repay 🥸  on behalf of public: 🍌 -> 🏦');
      const { receipt } = await lendingContract.methods
        .repay_private(
          lendingAccount.address,
          repayAmount,
          authwitNonce,
          0n,
          lendingAccount.address,
          stableCoin.address,
        )
        .send({ from: defaultAccountAddress, authWitnesses: [burnPrivateAuthwit] });
      await observeBlock(receipt.blockNumber);
      lendingSim.repayPrivate(lendingAccount.address, lendingAccount.address.toField(), repayAmount);
    });

    // Sets a public authwit for burn_public, advances slots, calls repay_public, and updates
    // simulator.
    it('Repay: 🍌 -> 🏦', async () => {
      const repayAmount = 20n;
      const authwitNonce = Fr.random();

      // Add it to the wallet as approved
      const validateAction = await wallet.setPublicAuthWit(
        defaultAccountAddress,
        {
          caller: lendingContract.address,
          action: stableCoin.methods.burn_public(lendingAccount.address, repayAmount, authwitNonce),
        },
        true,
      );
      await validateAction.send();

      await lendingSim.progressSlots(SLOT_JUMP, dateProvider, aztecNode);

      // Make a public repay of the debt in the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public debt.

      logger.info('Repay: 🍌 -> 🏦');
      const { receipt } = await lendingContract.methods
        .repay_public(repayAmount, authwitNonce, lendingAccount.address, stableCoin.address)
        .send({ from: defaultAccountAddress });
      await observeBlock(receipt.blockNumber);
      lendingSim.repayPublic(lendingAccount.address, lendingAccount.address.toField(), repayAmount);
    });
  });

  // Covers public and private withdrawal paths and over-withdrawal failure.
  describe('Withdraw', () => {
    // Advances slots, calls withdraw_public to retrieve public collateral, and updates simulator.
    it('Withdraw: 🏦 -> 💰', async () => {
      const withdrawAmount = 42n;
      await lendingSim.progressSlots(SLOT_JUMP, dateProvider, aztecNode);

      // Withdraw funds from the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public collateral.

      logger.info('Withdraw: 🏦 -> 💰');
      const { receipt } = await lendingContract.methods
        .withdraw_public(lendingAccount.address, withdrawAmount)
        .send({ from: defaultAccountAddress });
      await observeBlock(receipt.blockNumber);
      lendingSim.withdraw(lendingAccount.address.toField(), lendingAccount.address, withdrawAmount);
    });

    // Advances slots, calls withdraw_private to retrieve private collateral using secret, and
    // updates simulator.
    it('Withdraw 🥸 : 🏦 -> 💰', async () => {
      const withdrawAmount = 42n;
      await lendingSim.progressSlots(SLOT_JUMP, dateProvider, aztecNode);

      // Withdraw funds from the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the private collateral.

      logger.info('Withdraw 🥸 : 🏦 -> 💰');
      const { receipt } = await lendingContract.methods
        .withdraw_private(lendingAccount.secret, lendingAccount.address, withdrawAmount)
        .send({ from: defaultAccountAddress });
      await observeBlock(receipt.blockNumber);
      lendingSim.withdraw(await lendingAccount.key(), lendingAccount.address, withdrawAmount);
    });

    // Negative path: attempting to withdraw more collateral than available must revert.
    describe('failure cases', () => {
      // Simulates withdraw_public with an impossibly large amount and expects a revert.
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
