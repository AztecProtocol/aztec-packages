import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import {
  Account,
  AuthEntrypointCollection,
  AuthWitnessAccountContract,
  AuthWitnessEntrypointWallet,
  AztecAddress,
  CheatCodes,
  Fr,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { CircuitsWasm, CompleteAddress, FunctionSelector, GeneratorIndex, GrumpkinScalar } from '@aztec/circuits.js';
import { pedersenPlookupCommitInputs, pedersenPlookupCompressWithHashIndex } from '@aztec/circuits.js/barretenberg';
import { DebugLogger } from '@aztec/foundation/log';
import {
  LendingContract,
  PriceFeedContract,
  SchnorrAuthWitnessAccountContract,
  TokenContract,
} from '@aztec/noir-contracts/types';
import { AztecRPC, TxStatus } from '@aztec/types';

import { setup } from './fixtures/utils.js';

describe('e2e_lending_contract', () => {
  let aztecNode: AztecNodeService | undefined;
  let aztecRpcServer: AztecRPC;
  let wallet: AuthWitnessEntrypointWallet;
  let accounts: CompleteAddress[];
  let logger: DebugLogger;

  let cc: CheatCodes;

  const WAD = 10n ** 18n;
  const BASE = 10n ** 9n;

  const deployContracts = async (owner: AztecAddress) => {
    let lendingContract: LendingContract;
    let priceFeedContract: PriceFeedContract;

    let collateralAsset: TokenContract;
    let stableCoin: TokenContract;

    {
      logger(`Deploying price feed contract...`);
      const tx = PriceFeedContract.deploy(wallet).send();
      logger(`Tx sent with hash ${await tx.getTxHash()}`);
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger(`Price feed deployed to ${receipt.contractAddress}`);
      priceFeedContract = await PriceFeedContract.at(receipt.contractAddress!, wallet);
    }

    {
      logger(`Deploying collateral asset feed contract...`);
      const tx = TokenContract.deploy(wallet).send();
      logger(`Tx sent with hash ${await tx.getTxHash()}`);
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger(`Collateral asset deployed to ${receipt.contractAddress}`);
      collateralAsset = await TokenContract.at(receipt.contractAddress!, wallet);

      {
        const initTx = collateralAsset.methods._initialize({ address: owner }).send({ origin: owner });
        const receipt = await initTx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
      }
    }

    {
      logger(`Deploying stable coin contract...`);
      const tx = TokenContract.deploy(wallet).send();
      logger(`Tx sent with hash ${await tx.getTxHash()}`);
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger(`Stable coin asset deployed to ${receipt.contractAddress}`);
      stableCoin = await TokenContract.at(receipt.contractAddress!, wallet);

      {
        const initTx = stableCoin.methods._initialize({ address: owner }).send({ origin: owner });
        const receipt = await initTx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
      }
    }

    {
      logger(`Deploying lending contract...`);
      const tx = LendingContract.deploy(wallet).send();
      logger(`Tx sent with hash ${await tx.getTxHash()}`);
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger(`CDP deployed at ${receipt.contractAddress}`);
      lendingContract = await LendingContract.at(receipt.contractAddress!, wallet);
    }
    {
      const minterTx = stableCoin.methods.set_minter({ address: lendingContract.address }, 1).send({ origin: owner });
      const receipt = await minterTx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
    }

    return { priceFeedContract, lendingContract, collateralAsset, stableCoin };
  };

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, logger, cheatCodes: cc } = await setup(0));

    {
      const _accounts = [];
      for (let i = 0; i < 2; i++) {
        const privateKey = GrumpkinScalar.random();
        const account = new Account(aztecRpcServer, privateKey, new AuthWitnessAccountContract(privateKey));
        const deployTx = await account.deploy();
        await deployTx.wait({ interval: 0.1 });
        _accounts.push(account);
      }
      wallet = new AuthWitnessEntrypointWallet(aztecRpcServer, await AuthEntrypointCollection.fromAccounts(_accounts));
      accounts = await wallet.getAccounts();
    }
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    if (aztecRpcServer instanceof AztecRPCServer) {
      await aztecRpcServer?.stop();
    }
  });

  const hashPayload = async (payload: Fr[]) => {
    return pedersenPlookupCompressWithHashIndex(
      await CircuitsWasm.get(),
      payload.map(fr => fr.toBuffer()),
      GeneratorIndex.SIGNATURE_PAYLOAD,
    );
  };

  const unshieldMessageHash = async (
    caller: AztecAddress,
    from: AztecAddress,
    to: AztecAddress,
    amount: bigint,
    nonce: Fr,
  ) => {
    return await hashPayload([
      caller.toField(),
      FunctionSelector.fromSignature('unshield((Field),(Field),Field,Field)').toField(),
      from.toField(),
      to.toField(),
      new Fr(amount),
      nonce,
    ]);
  };

  const transferPublicMessageHash = async (
    caller: AztecAddress,
    from: AztecAddress,
    to: AztecAddress,
    amount: bigint,
    nonce: Fr,
  ) => {
    return await hashPayload([
      caller.toField(),
      FunctionSelector.fromSignature('transfer_public((Field),(Field),Field,Field)').toField(),
      from.toField(),
      to.toField(),
      new Fr(amount),
      nonce,
    ]);
  };

  // Fetch a storage snapshot from the contract that we can use to compare between transitions.
  const getStorageSnapshot = async (
    lendingContract: LendingContract,
    collateralAsset: TokenContract,
    stableCoin: TokenContract,
    account: LendingAccount,
  ) => {
    logger('Fetching storage snapshot 📸 ');
    const accountKey = await account.key();

    const tot = await lendingContract.methods.get_asset(0).view();
    const privatePos = await lendingContract.methods.get_position(accountKey).view();
    const publicPos = await lendingContract.methods.get_position(account.address.toField()).view();
    const totalCollateral = await collateralAsset.methods
      .balance_of_public({ address: lendingContract.address })
      .view();

    return {
      interestAccumulator: new Fr(tot['interest_accumulator']),
      lastUpdatedTs: new Fr(tot['last_updated_ts']),
      privateCollateral: new Fr(privatePos['collateral']),
      privateStaticDebt: new Fr(privatePos['static_debt']),
      privateDebt: new Fr(privatePos['debt']),
      publicCollateral: new Fr(publicPos['collateral']),
      publicStaticDebt: new Fr(publicPos['static_debt']),
      publicDebt: new Fr(publicPos['debt']),
      totalCollateral: new Fr(totalCollateral),
      stableCoinLending: new Fr(
        await stableCoin.methods.balance_of_public({ address: lendingContract.address }).view(),
      ),
      stableCoinSupply: new Fr(await stableCoin.methods.total_supply().view()),
      stableCoinPublic: new Fr(await stableCoin.methods.balance_of_public({ address: account.address }).view()),
      stableCoinPrivate: new Fr(await stableCoin.methods.balance_of_private({ address: account.address }).view()),
    };
  };

  // Convenience struct to hold an account's address and secret that can easily be passed around.
  // Contains utilities to compute the "key" for private holdings in the public state.
  class LendingAccount {
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

  // Helper class that emulates the logic of the lending contract. Used to have a "twin" to check values against.
  class LendingSimulator {
    public accumulator: bigint = BASE;
    public time: number = 0;

    private collateral: { [key: string]: Fr } = {};
    private staticDebt: { [key: string]: Fr } = {};
    private stableBalance: { [key: string]: Fr } = {};
    private repaid: bigint = 0n;

    private key: Fr = Fr.ZERO;

    constructor(private cc: CheatCodes, private account: LendingAccount, private rate: bigint) {}

    async prepare() {
      this.key = await this.account.key();
      const ts = await this.cc.eth.timestamp();
      this.time = ts + 10 + (ts % 10);
      await this.cc.aztec.warp(this.time);
    }

    async progressTime(diff: number) {
      this.time = this.time + diff;
      await this.cc.aztec.warp(this.time);
      this.accumulator = muldivDown(this.accumulator, computeMultiplier(this.rate, BigInt(diff)), BASE);
    }

    mintStable(to: Fr, amount: bigint) {
      const balance = this.stableBalance[to.toString()] ?? Fr.ZERO;
      this.stableBalance[to.toString()] = new Fr(balance.value + amount);
    }

    deposit(onBehalfOf: Fr, amount: bigint) {
      const coll = this.collateral[onBehalfOf.toString()] ?? Fr.ZERO;
      this.collateral[onBehalfOf.toString()] = new Fr(coll.value + amount);
    }

    withdraw(owner: Fr, amount: bigint) {
      const coll = this.collateral[owner.toString()] ?? Fr.ZERO;
      this.collateral[owner.toString()] = new Fr(coll.value - amount);
    }

    borrow(owner: Fr, recipient: Fr, amount: bigint) {
      const staticDebtBal = this.staticDebt[owner.toString()] ?? Fr.ZERO;
      const increase = muldivUp(amount, BASE, this.accumulator);
      this.staticDebt[owner.toString()] = new Fr(staticDebtBal.value + increase);

      const balance = this.stableBalance[recipient.toString()] ?? Fr.ZERO;
      this.stableBalance[recipient.toString()] = new Fr(balance.value + amount);
    }

    repay(owner: Fr, onBehalfOf: Fr, amount: bigint) {
      const staticDebtBal = this.staticDebt[onBehalfOf.toString()] ?? Fr.ZERO;
      const decrease = muldivDown(amount, BASE, this.accumulator);
      this.staticDebt[onBehalfOf.toString()] = new Fr(staticDebtBal.value - decrease);

      const balance = this.stableBalance[owner.toString()] ?? Fr.ZERO;
      this.stableBalance[owner.toString()] = new Fr(balance.value - amount);
      this.repaid += amount;
    }

    check(storage: { [key: string]: Fr }) {
      expect(storage['interestAccumulator']).toEqual(new Fr(this.accumulator));
      expect(storage['lastUpdatedTs']).toEqual(new Fr(this.time));

      // Private values
      const keyPriv = this.key.toString();
      expect(storage['privateCollateral']).toEqual(this.collateral[keyPriv] ?? Fr.ZERO);
      expect(storage['privateStaticDebt']).toEqual(this.staticDebt[keyPriv] ?? Fr.ZERO);
      expect(storage['privateDebt'].value).toEqual(
        muldivUp((this.staticDebt[keyPriv] ?? Fr.ZERO).value, this.accumulator, BASE),
      );

      // Public values
      const keyPub = this.account.address.toString();
      expect(storage['publicCollateral']).toEqual(this.collateral[keyPub] ?? Fr.ZERO);
      expect(storage['publicStaticDebt']).toEqual(this.staticDebt[keyPub] ?? Fr.ZERO);
      expect(storage['publicDebt'].value).toEqual(
        muldivUp((this.staticDebt[keyPub] ?? Fr.ZERO).value, this.accumulator, BASE),
      );

      const totalCollateral = Object.values(this.collateral).reduce((a, b) => new Fr(a.value + b.value), Fr.ZERO);
      expect(storage['totalCollateral']).toEqual(totalCollateral);

      expect(storage['stableCoinLending'].value).toEqual(this.repaid);
      expect(storage['stableCoinPublic']).toEqual(this.stableBalance[keyPub] ?? Fr.ZERO);

      // Abusing notation and using the `keyPriv` as if an address for private holdings of stable_coin while it has the same owner in reality.
      expect(storage['stableCoinPrivate']).toEqual(this.stableBalance[keyPriv] ?? Fr.ZERO);

      const totalStableSupply = Object.values(this.stableBalance).reduce((a, b) => new Fr(a.value + b.value), Fr.ZERO);
      // @todo @lherskind To be updated such that we burn assets on repay instead.
      expect(storage['stableCoinSupply'].value).toEqual(totalStableSupply.value + this.repaid);
    }
  }

  it('Full lending run-through', async () => {
    // Gotta use the actual auth witness account here and not the standard wallet.
    const recipientFull = accounts[0];
    const recipient = recipientFull.address;

    const { lendingContract, priceFeedContract, collateralAsset, stableCoin } = await deployContracts(recipient);

    const lendingAccount = new LendingAccount(recipient, new Fr(42));

    const storageSnapshots: { [key: string]: { [key: string]: Fr } } = {};

    const setPrice = async (newPrice: bigint) => {
      const tx = priceFeedContract.methods.set_price(0n, newPrice).send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
    };

    await setPrice(2n * 10n ** 9n);

    {
      // Minting assets so we have them at hand.
      const amount = 10000n;
      {
        const mintPubTx = collateralAsset.methods.mint_pub({ address: recipient }, amount).send({ origin: recipient });
        const mintPubReceipt = await mintPubTx.wait();
        expect(mintPubReceipt.status).toBe(TxStatus.MINED);
        const secret = Fr.random();
        const secretHash = await computeMessageSecretHash(secret);
        const mintPrivTx = collateralAsset.methods.mint_priv(amount, secretHash).send({ origin: recipient });
        const mintPrivReceipt = await mintPrivTx.wait();
        expect(mintPrivReceipt.status).toBe(TxStatus.MINED);
        const claimTx = collateralAsset.methods
          .redeem_shield({ address: recipient }, amount, secret)
          .send({ origin: recipient });
        const claimReceipt = await claimTx.wait();
        expect(claimReceipt.status).toBe(TxStatus.MINED);
      }
      {
        const mintPubTx = stableCoin.methods.mint_pub({ address: recipient }, amount).send({ origin: recipient });
        const mintPubReceipt = await mintPubTx.wait();
        expect(mintPubReceipt.status).toBe(TxStatus.MINED);
        const secret = Fr.random();
        const secretHash = await computeMessageSecretHash(secret);
        const mintPrivTx = stableCoin.methods.mint_priv(amount, secretHash).send({ origin: recipient });
        const mintPrivReceipt = await mintPrivTx.wait();
        expect(mintPrivReceipt.status).toBe(TxStatus.MINED);
        const claimTx = stableCoin.methods
          .redeem_shield({ address: recipient }, amount, secret)
          .send({ origin: recipient });
        const claimReceipt = await claimTx.wait();
        expect(claimReceipt.status).toBe(TxStatus.MINED);
      }
    }

    // Also specified in `noir-contracts/src/contracts/lending_contract/src/main.nr`
    const rate = 1268391679n;
    const lendingSim = new LendingSimulator(cc, lendingAccount, rate);
    await lendingSim.prepare();
    // To handle initial mint (we use these funds to refund privately without shielding first).
    lendingSim.mintStable(await lendingAccount.key(), 10000n);
    lendingSim.mintStable(lendingAccount.address.toField(), 10000n);

    {
      // Initialize the contract values, setting the interest accumulator to 1e9 and the last updated timestamp to now.
      logger('Initializing contract');
      const tx = lendingContract.methods
        .init(priceFeedContract.address, 8000, collateralAsset.address, stableCoin.address)
        .send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['initial'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );

      lendingSim.check(storageSnapshots['initial']);
    }

    {
      const depositAmount = 420n;

      const nonce = Fr.random();
      const messageHash = await unshieldMessageHash(
        lendingContract.address,
        recipient,
        lendingContract.address,
        depositAmount,
        nonce,
      );
      await wallet.signAndAddAuthWitness(messageHash);
      await lendingSim.progressTime(10);
      lendingSim.deposit(await lendingAccount.key(), depositAmount);

      // Make a private deposit of funds into own account.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the private collateral.
      logger('Depositing 🥸 : 💰 -> 🏦');
      const tx = lendingContract.methods
        .deposit_private(lendingAccount.secret, 0n, depositAmount, collateralAsset.address, nonce)
        .send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_deposit'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );

      lendingSim.check(storageSnapshots['private_deposit']);
    }

    {
      const depositAmount = 421n;
      const nonce = Fr.random();
      const messageHash = await unshieldMessageHash(
        lendingContract.address,
        recipient,
        lendingContract.address,
        depositAmount,
        nonce,
      );
      await wallet.signAndAddAuthWitness(messageHash);

      await lendingSim.progressTime(10);
      lendingSim.deposit(recipient.toField(), depositAmount);
      // Make a private deposit of funds into another account, in this case, a public account.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public collateral.
      logger('Depositing 🥸 on behalf of recipient: 💰 -> 🏦');
      const tx = lendingContract.methods
        .deposit_private(0n, recipient.toField(), depositAmount, collateralAsset.address, nonce)
        .send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_deposit_on_behalf'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );

      lendingSim.check(storageSnapshots['private_deposit_on_behalf']);
    }

    {
      const depositAmount = 211n;
      const nonce = Fr.random();
      const messageHash = await transferPublicMessageHash(
        lendingContract.address,
        recipient,
        lendingContract.address,
        depositAmount,
        nonce,
      );

      // Add it to the wallet as approved
      const me = await SchnorrAuthWitnessAccountContract.at(accounts[0].address, wallet);
      const setValidTx = me.methods.set_is_valid_storage(messageHash, 1).send({ origin: accounts[0].address });
      const validTxReceipt = await setValidTx.wait();
      expect(validTxReceipt.status).toBe(TxStatus.MINED);

      await lendingSim.progressTime(10);
      lendingSim.deposit(recipient.toField(), depositAmount);

      // Make a public deposit of funds into self.
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public collateral.

      logger('Depositing: 💰 -> 🏦');
      const tx = lendingContract.methods
        .deposit_public(lendingAccount.address, depositAmount, collateralAsset.address, nonce)
        .send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['public_deposit'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );
      lendingSim.check(storageSnapshots['public_deposit']);
    }

    {
      const borrowAmount = 69n;
      await lendingSim.progressTime(10);
      lendingSim.borrow(await lendingAccount.key(), lendingAccount.address.toField(), borrowAmount);

      // Make a private borrow using the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the private debt.

      logger('Borrow 🥸 : 🏦 -> 🍌');
      const tx = lendingContract.methods
        .borrow_private(lendingAccount.secret, lendingAccount.address, borrowAmount)
        .send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_borrow'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );

      lendingSim.check(storageSnapshots['private_borrow']);
    }

    {
      const borrowAmount = 69n;
      await lendingSim.progressTime(10);
      lendingSim.borrow(recipient.toField(), lendingAccount.address.toField(), borrowAmount);

      // Make a public borrow using the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - increase the public debt.

      logger('Borrow: 🏦 -> 🍌');
      const tx = lendingContract.methods
        .borrow_public(lendingAccount.address, borrowAmount)
        .send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['public_borrow'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );

      lendingSim.check(storageSnapshots['public_borrow']);
    }

    {
      const repayAmount = 20n;
      const nonce = Fr.random();
      const messageHash = await unshieldMessageHash(
        lendingContract.address,
        recipient,
        lendingContract.address,
        repayAmount,
        nonce,
      );
      await wallet.signAndAddAuthWitness(messageHash);

      await lendingSim.progressTime(10);
      lendingSim.repay(await lendingAccount.key(), await lendingAccount.key(), repayAmount);

      // Make a private repay of the debt in the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the private debt.

      logger('Repay 🥸 : 🍌 -> 🏦');
      const tx = lendingContract.methods
        .repay_private(lendingAccount.secret, 0n, repayAmount, stableCoin.address, nonce)
        .send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_repay'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );

      lendingSim.check(storageSnapshots['private_repay']);
    }

    {
      const repayAmount = 21n;
      const nonce = Fr.random();
      const messageHash = await unshieldMessageHash(
        lendingContract.address,
        recipient,
        lendingContract.address,
        repayAmount,
        nonce,
      );
      await wallet.signAndAddAuthWitness(messageHash);

      await lendingSim.progressTime(10);
      lendingSim.repay(await lendingAccount.key(), lendingAccount.address.toField(), repayAmount);

      // Make a private repay of the debt in the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public debt.

      logger('Repay 🥸  on behalf of public: 🍌 -> 🏦');
      const tx = lendingContract.methods
        .repay_private(0n, recipient.toField(), repayAmount, stableCoin.address, nonce)
        .send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_repay_on_behalf'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );

      lendingSim.check(storageSnapshots['private_repay_on_behalf']);
    }

    {
      const repayAmount = 20n;
      const nonce = Fr.random();
      const messageHash = await transferPublicMessageHash(
        lendingContract.address,
        recipient,
        lendingContract.address,
        repayAmount,
        nonce,
      );

      // Add it to the wallet as approved
      const me = await SchnorrAuthWitnessAccountContract.at(accounts[0].address, wallet);
      const setValidTx = me.methods.set_is_valid_storage(messageHash, 1).send({ origin: accounts[0].address });
      const validTxReceipt = await setValidTx.wait();
      expect(validTxReceipt.status).toBe(TxStatus.MINED);

      await lendingSim.progressTime(10);
      lendingSim.repay(lendingAccount.address.toField(), lendingAccount.address.toField(), repayAmount);

      // Make a public repay of the debt in the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public debt.

      logger('Repay: 🍌 -> 🏦');
      const tx = lendingContract.methods
        .repay_public(recipient.toField(), 20n, stableCoin.address, nonce)
        .send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['public_repay'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );

      lendingSim.check(storageSnapshots['public_repay']);
    }

    {
      // Withdraw more than possible to test the revert.
      logger('Withdraw: trying to withdraw more than possible');
      const tx = lendingContract.methods
        .withdraw_public(recipient, 10n ** 9n)
        .send({ origin: recipient, skipPublicSimulation: true });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.DROPPED);
    }

    {
      const withdrawAmount = 42n;
      await lendingSim.progressTime(10);
      lendingSim.withdraw(recipient.toField(), withdrawAmount);

      // Withdraw funds from the public account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the public collateral.

      logger('Withdraw: 🏦 -> 💰');
      const tx = lendingContract.methods.withdraw_public(recipient, withdrawAmount).send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['public_withdraw'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );

      lendingSim.check(storageSnapshots['public_withdraw']);
    }

    {
      const withdrawAmount = 42n;
      await lendingSim.progressTime(10);
      lendingSim.withdraw(await lendingAccount.key(), withdrawAmount);

      // Withdraw funds from the private account
      // This should:
      // - increase the interest accumulator
      // - increase last updated timestamp.
      // - decrease the private collateral.

      logger('Withdraw 🥸 : 🏦 -> 💰');
      const tx = lendingContract.methods
        .withdraw_private(lendingAccount.secret, lendingAccount.address, withdrawAmount)
        .send({ origin: recipient });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['private_withdraw'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );

      lendingSim.check(storageSnapshots['private_withdraw']);
    }

    {
      // Try to call the internal `_deposit` function directly
      // This should:
      // - not change any storage values.
      // - fail

      const tx = lendingContract.methods
        ._deposit(recipient.toField(), 42n, collateralAsset.address)
        .send({ origin: recipient, skipPublicSimulation: true });
      await tx.isMined({ interval: 0.1 });
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.DROPPED);
      logger('Rejected call directly to internal function 🧚 ');
      storageSnapshots['attempted_internal_deposit'] = await getStorageSnapshot(
        lendingContract,
        collateralAsset,
        stableCoin,
        lendingAccount,
      );
      expect(storageSnapshots['private_withdraw']).toEqual(storageSnapshots['attempted_internal_deposit']);
    }
  }, 650_000);
});
