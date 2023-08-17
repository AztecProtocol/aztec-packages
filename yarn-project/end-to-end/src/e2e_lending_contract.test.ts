import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import { AztecAddress, Fr, Wallet } from '@aztec/aztec.js';
import { CircuitsWasm, CompleteAddress } from '@aztec/circuits.js';
import { pedersenPlookupCommitInputs } from '@aztec/circuits.js/barretenberg';
import { DebugLogger } from '@aztec/foundation/log';
import { LendingContract, PriceFeedContract } from '@aztec/noir-contracts/types';
import { NativeTokenContract } from '@aztec/noir-contracts/types';
import { AztecRPC, TxStatus } from '@aztec/types';

import { CheatCodes } from './fixtures/cheat_codes.js';
import { setup } from './fixtures/utils.js';

describe('e2e_lending_contract', () => {
  let aztecNode: AztecNodeService | undefined;
  let aztecRpcServer: AztecRPC;
  let wallet: Wallet;
  let accounts: CompleteAddress[];
  let logger: DebugLogger;

  let cc: CheatCodes;

  const WAD = 10n ** 18n;
  const BASE = 10n ** 9n;

  const deployContract = async (owner: AztecAddress) => {
    let lendingContract: LendingContract;
    let priceFeedContract: PriceFeedContract;

    let collateralAsset: NativeTokenContract;
    let debtAsset: NativeTokenContract;

    {
      logger(`Deploying price feed contract...`);
      const tx = PriceFeedContract.deploy(aztecRpcServer).send();
      logger(`Tx sent with hash ${await tx.getTxHash()}`);
      logger(`isMined: ${await tx.isMined({ interval: 0.1 })}`);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger(`Price feed deployed to ${receipt.contractAddress}`);
      priceFeedContract = await PriceFeedContract.at(receipt.contractAddress!, wallet);
    }

    {
      logger(`Deploying collateral asset feed contract...`);
      const tx = NativeTokenContract.deploy(aztecRpcServer, 10000n, owner).send();
      logger(`Tx sent with hash ${await tx.getTxHash()}`);
      logger(`isMined: ${await tx.isMined({ interval: 0.1 })}`);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger(`Collateral asset deployed to ${receipt.contractAddress}`);
      collateralAsset = await NativeTokenContract.at(receipt.contractAddress!, wallet);
    }

    {
      // @todo @lherskind This need to be a non-transferrable token.
      logger(`Deploying debt asset feed contract...`);
      const tx = NativeTokenContract.deploy(aztecRpcServer, 10000n, owner).send();
      logger(`Tx sent with hash ${await tx.getTxHash()}`);
      logger(`isMined: ${await tx.isMined({ interval: 0.1 })}`);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger(`Debt asset deployed to ${receipt.contractAddress}`);
      debtAsset = await NativeTokenContract.at(receipt.contractAddress!, wallet);
    }

    {
      logger(`Deploying L2 public contract...`);
      const tx = LendingContract.deploy(aztecRpcServer).send();
      logger(`Tx sent with hash ${await tx.getTxHash()}`);
      logger(`isMined: ${await tx.isMined({ interval: 0.1 })}`);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger(`CDP deployed at ${receipt.contractAddress}`);
      lendingContract = await LendingContract.at(receipt.contractAddress!, wallet);
    }
    return { priceFeedContract, lendingContract, collateralAsset, debtAsset };
  };

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, wallet, accounts, logger, cheatCodes: cc } = await setup());
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    if (aztecRpcServer instanceof AztecRPCServer) {
      await aztecRpcServer?.stop();
    }
  });

  // Fetch a storage snapshot from the contract that we can use to compare between transitions.
  const getStorageSnapshot = async (
    lendingContract: LendingContract,
    collateralAsset: NativeTokenContract,
    aztecNode: AztecRPC,
    account: Account,
  ) => {
    logger('Fetching storage snapshot 📸 ');
    const storageValues: { [key: string]: Fr } = {};
    const accountKey = await account.key();

    const tot = await lendingContract.methods.getTot(0).view();
    const privatePos = await lendingContract.methods.getPosition(accountKey).view();
    const publicPos = await lendingContract.methods.getPosition(account.address.toField()).view();
    const totalCollateral = await collateralAsset.methods.publicBalanceOf(lendingContract.address).view();

    storageValues['interest_accumulator'] = new Fr(tot['interest_accumulator']);
    storageValues['last_updated_ts'] = new Fr(tot['last_updated_ts']);
    storageValues['private_collateral'] = new Fr(privatePos['collateral']);
    storageValues['private_static_debt'] = new Fr(privatePos['static_debt']);
    storageValues['private_debt'] = new Fr(privatePos['debt']);
    storageValues['public_collateral'] = new Fr(publicPos['collateral']);
    storageValues['public_static_debt'] = new Fr(publicPos['static_debt']);
    storageValues['public_debt'] = new Fr(publicPos['debt']);

    storageValues['total_collateral'] = new Fr(totalCollateral);

    return storageValues;
  };

  // Convenience struct to hold an account's address and secret that can easily be passed around.
  // Contains utilities to compute the "key" for private holdings in the public state.
  class Account {
    public readonly address: AztecAddress;
    public readonly secret: Fr;

    constructor(address: AztecAddress, secret: Fr) {
      this.address = address;
      this.secret = secret;
    }

    public async key(): Promise<Fr> {
      return Fr.fromBuffer(
        pedersenPlookupCommitInputs(
          await CircuitsWasm.get(),
          [this.address, this.secret].map(f => f.toBuffer()),
        ),
      );
    }
  }

  const muldivDown = (a: bigint, b: bigint, c: bigint) => (a * b) / c;

  const muldivUp = (a: bigint, b: bigint, c: bigint) => {
    const adder = (a * b) % c > 0n ? 1n : 0n;
    return muldivDown(a, b, c) + adder;
  };

  const computeMultiplier = (rate: bigint, dt: bigint) => {
    if (dt == 0n) {
      return BASE;
    }

    const expMinusOne = dt - 1n;
    const expMinusTwo = dt > 2 ? dt - 2n : 0n;

    const basePowerTwo = muldivDown(rate, rate, WAD);
    const basePowerThree = muldivDown(basePowerTwo, rate, WAD);

    const temp = dt * expMinusOne;
    const secondTerm = muldivDown(temp, basePowerTwo, 2n);
    const thirdTerm = muldivDown(temp * expMinusTwo, basePowerThree, 6n);

    const offset = (dt * rate + secondTerm + thirdTerm) / (WAD / BASE);

    return BASE + offset;
  };

  class Skibbidy {
    public accumulator: bigint = BASE;
    public time: number = 0;

    private collateral: { [key: string]: Fr } = {};
    private staticDebt: { [key: string]: Fr } = {};

    private key: Fr = Fr.ZERO;

    constructor(private cc: CheatCodes, private account: Account, private rate: bigint) {}

    prepare = async () => {
      this.key = await this.account.key();
      const ts = await this.cc.l1.timestamp();
      this.time = ts + 10 + (ts % 10);
      await this.cc.l2.warp(this.time);
    };

    progressTime = async (diff: number) => {
      this.time = this.time + diff;
      await this.cc.l2.warp(this.time);
      this.accumulator = muldivDown(this.accumulator, computeMultiplier(this.rate, BigInt(diff)), BASE);
    };

    deposit = (owner: Fr, amount: bigint) => {
      const coll = this.collateral[owner.toString()] ?? Fr.ZERO;
      this.collateral[owner.toString()] = new Fr(coll.value + amount);
    };

    withdraw = (owner: Fr, amount: bigint) => {
      const coll = this.collateral[owner.toString()] ?? Fr.ZERO;
      this.collateral[owner.toString()] = new Fr(coll.value - amount);
    };

    borrow = (owner: Fr, amount: bigint) => {
      const staticDebtBal = this.staticDebt[owner.toString()] ?? Fr.ZERO;
      const increase = muldivUp(amount, BASE, this.accumulator);
      this.staticDebt[owner.toString()] = new Fr(staticDebtBal.value + increase);
    };

    repay = (owner: Fr, amount: bigint) => {
      const staticDebtBal = this.staticDebt[owner.toString()] ?? Fr.ZERO;
      const decrease = muldivDown(amount, BASE, this.accumulator);
      this.staticDebt[owner.toString()] = new Fr(staticDebtBal.value - decrease);
    };

    check = (storage: { [key: string]: Fr }) => {
      expect(storage['interest_accumulator']).toEqual(new Fr(this.accumulator));
      expect(storage['last_updated_ts']).toEqual(new Fr(this.time));

      // Private values
      const keyPriv = this.key.toString();
      expect(storage['private_collateral']).toEqual(this.collateral[keyPriv] ?? Fr.ZERO);
      expect(storage['private_static_debt']).toEqual(this.staticDebt[keyPriv] ?? Fr.ZERO);
      expect(storage['private_debt'].value).toEqual(
        muldivUp((this.staticDebt[keyPriv] ?? Fr.ZERO).value, this.accumulator, BASE),
      );

      // Private values
      const keyPub = this.account.address.toString();
      expect(storage['public_collateral']).toEqual(this.collateral[keyPub] ?? Fr.ZERO);
      expect(storage['public_static_debt']).toEqual(this.staticDebt[keyPub] ?? Fr.ZERO);
      expect(storage['public_debt'].value).toEqual(
        muldivUp((this.staticDebt[keyPub] ?? Fr.ZERO).value, this.accumulator, BASE),
      );

      const totalCollateral = Object.values(this.collateral).reduce((a, b) => new Fr(a.value + b.value), Fr.ZERO);
      // @todo @lherskind Perform this check when proper token transfers are in place
      // expect(storage['total_collateral']).toEqual(totalCollateral);
      console.log(`Total collateral: ${totalCollateral.toString()}`);
    };
  }

  it('Full lending run-through', async () => {
    const recipientIdx = 0;

    const recipient = accounts[recipientIdx].address;
    const { lendingContract, priceFeedContract, collateralAsset, debtAsset } = await deployContract(recipient);

    const account = new Account(recipient, new Fr(42));

    const storageSnapshots: { [key: string]: { [key: string]: Fr } } = {};

    const setPrice = async (newPrice: bigint) => {
      const tx = priceFeedContract.methods.set_price(0n, newPrice).send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
    };

    await setPrice(2n * 10n ** 9n);

    {
      // Minting some collateral in public so we got it at hand.
      const tx = collateralAsset.methods.owner_mint_pub(account.address, 10000n).send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
    }

    const rate = 1268391679n;
    const guy = new Skibbidy(cc, account, rate);
    await guy.prepare();

    {
      // Initialize the contract values, setting the interest accumulator to 1e9 and the last updated timestamp to now.
      logger('Initializing contract');
      const tx = lendingContract.methods
        .init(priceFeedContract.address, 8000, collateralAsset.address, debtAsset.address)
        .send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['initial'] = await getStorageSnapshot(lendingContract, collateralAsset, aztecRpcServer, account);

      guy.check(storageSnapshots['initial']);
    }

    {
      const depositAmount = 420n;
      await guy.progressTime(10);
      guy.deposit(await account.key(), depositAmount);

      // Make a private deposit of funds into own account.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the private collateral.
      logger('Depositing 🥸 : 💰 -> 🏦');
      const tx = lendingContract.methods
        .deposit_private(account.secret, account.address, 0n, depositAmount, collateralAsset.address)
        .send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_deposit'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        aztecRpcServer,
        account,
      );

      guy.check(storageSnapshots['private_deposit']);
    }

    {
      const depositAmount = 420n;
      await guy.progressTime(10);
      guy.deposit(recipient.toField(), depositAmount);
      // Make a private deposit of funds into another account, in this case, a public account.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public collateral.
      logger('Depositing 🥸 on behalf of recipient: 💰 -> 🏦');
      const tx = lendingContract.methods
        .deposit_private(0n, account.address, recipient.toField(), depositAmount, collateralAsset.address)
        .send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_deposit_on_behalf'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        aztecRpcServer,
        account,
      );

      guy.check(storageSnapshots['private_deposit_on_behalf']);
    }

    {
      const depositAmount = 211n;
      await guy.progressTime(10);
      guy.deposit(recipient.toField(), depositAmount);

      // Make a public deposit of funds into self.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public collateral.

      logger('Depositing: 💰 -> 🏦');
      const tx = lendingContract.methods
        .deposit_public(account.address, depositAmount, collateralAsset.address)
        .send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['public_deposit'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        aztecRpcServer,
        account,
      );

      guy.check(storageSnapshots['public_deposit']);
    }

    {
      const borrowAmount = 69n;
      await guy.progressTime(10);
      guy.borrow(await account.key(), borrowAmount);

      // Make a private borrow using the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the private debt.

      logger('Borrow 🥸 : 🏦 -> 🍌');
      const tx = lendingContract.methods.borrow_private(account.secret, borrowAmount).send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_borrow'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        aztecRpcServer,
        account,
      );

      guy.check(storageSnapshots['private_borrow']);
    }

    {
      const borrowAmount = 69n;
      await guy.progressTime(10);
      guy.borrow(recipient.toField(), borrowAmount);

      // Make a public borrow using the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public debt.

      logger('Borrow: 🏦 -> 🍌');
      const tx = lendingContract.methods.borrow_public(borrowAmount).send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['public_borrow'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        aztecRpcServer,
        account,
      );

      guy.check(storageSnapshots['public_borrow']);
    }

    {
      const repayAmount = 20n;
      await guy.progressTime(10);
      guy.repay(await account.key(), repayAmount);

      // Make a private repay of the debt in the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the private debt.

      logger('Repay 🥸 : 🍌 -> 🏦');
      const tx = lendingContract.methods.repay_private(account.secret, 0n, repayAmount).send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_repay'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        aztecRpcServer,
        account,
      );

      guy.check(storageSnapshots['private_repay']);
    }

    {
      const repayAmount = 20n;
      await guy.progressTime(10);
      guy.repay(recipient.toField(), repayAmount);

      // Make a private repay of the debt in the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public debt.

      logger('Repay 🥸  on behalf of public: 🍌 -> 🏦');
      const tx = lendingContract.methods
        .repay_private(0n, recipient.toField(), repayAmount)
        .send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_repay_on_behalf'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        aztecRpcServer,
        account,
      );

      guy.check(storageSnapshots['private_repay_on_behalf']);
    }

    {
      const repayAmount = 20n;
      await guy.progressTime(10);
      guy.repay(recipient.toField(), repayAmount);

      // Make a public repay of the debt in the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public debt.

      logger('Repay: 🍌 -> 🏦');
      const tx = lendingContract.methods.repay_public(recipient.toField(), 20n).send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['public_repay'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        aztecRpcServer,
        account,
      );

      guy.check(storageSnapshots['public_repay']);
    }

    {
      // Withdraw more than possible to test the revert.
      logger('Withdraw: trying to withdraw more than possible');
      const tx = lendingContract.methods.withdraw_public(10n ** 9n).send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.DROPPED);
    }

    {
      const withdrawAmount = 42n;
      await guy.progressTime(10);
      guy.withdraw(recipient.toField(), withdrawAmount);

      // Withdraw funds from the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public collateral.

      logger('Withdraw: 🏦 -> 💰');
      const tx = lendingContract.methods.withdraw_public(withdrawAmount).send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['public_withdraw'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        aztecRpcServer,
        account,
      );

      guy.check(storageSnapshots['public_withdraw']);
    }

    {
      const withdrawAmount = 42n;
      await guy.progressTime(10);
      guy.withdraw(await account.key(), withdrawAmount);

      // Withdraw funds from the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the private collateral.

      logger('Withdraw 🥸 : 🏦 -> 💰');
      const tx = lendingContract.methods.withdraw_private(account.secret, withdrawAmount).send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_withdraw'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        aztecRpcServer,
        account,
      );

      guy.check(storageSnapshots['private_withdraw']);
    }

    {
      // Try to call the internal `_deposit` function directly
      // This should:
      // - not change any storage values.
      // - fail

      const tx = lendingContract.methods
        ._deposit(recipient.toField(), 42n, collateralAsset.address)
        .send({ origin: recipient });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.DROPPED);
      logger('Rejected call directly to internal function 🧚 ');
      storageSnapshots['attempted_internal_deposit'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        aztecRpcServer,
        account,
      );
      expect(storageSnapshots['private_withdraw']).toEqual(storageSnapshots['attempted_internal_deposit']);
    }
  }, 650_000);
});
