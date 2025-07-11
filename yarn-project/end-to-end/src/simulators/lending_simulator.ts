// Convenience struct to hold an account's address and secret that can easily be passed around.
import { AztecAddress, Fr } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec/testing';
import type { RollupContract } from '@aztec/ethereum';
import { pedersenHash } from '@aztec/foundation/crypto';
import type { TestDateProvider } from '@aztec/foundation/timer';
import type { LendingContract } from '@aztec/noir-contracts.js/Lending';

import type { TokenSimulator } from './token_simulator.js';

/**
 * Contains utilities to compute the "key" for private holdings in the public state.
 */
export class LendingAccount {
  /** The address that owns this account */
  public readonly address: AztecAddress;
  /** The secret used for private deposits */
  public readonly secret: Fr;

  constructor(address: AztecAddress, secret: Fr) {
    this.address = address;
    this.secret = secret;
  }

  /**
   * Computes the key for the private holdings of this account.
   * @returns Key in public space
   */
  public key() {
    return pedersenHash([this.address, this.secret]);
  }
}

const WAD = 10n ** 18n;
const BASE = 10n ** 9n;

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

/**
 * Helper class that emulates the logic of the lending contract. Used to have a "twin" to check values against.
 */
export class LendingSimulator {
  /** interest rate accumulator */
  public accumulator: bigint = 0n;
  /** the timestamp of the simulator*/
  public time: number = 0;

  private collateral: { [key: string]: Fr } = {};
  private staticDebt: { [key: string]: Fr } = {};
  private borrowed: bigint = 0n;
  private mintedOutside: bigint = 0n;

  constructor(
    private cc: CheatCodes,
    private account: LendingAccount,
    private rate: bigint,
    private ethereumSlotDuration: number,
    /** the rollup contract */
    public rollup: RollupContract,
    /** the lending contract */
    public lendingContract: LendingContract,
    /** the collateral asset used in the lending contract */
    public collateralAsset: TokenSimulator,
    /** the stable-coin borrowed in the lending contract */
    public stableCoin: TokenSimulator,
  ) {}

  async prepare() {
    this.accumulator = BASE;
    const slot = await this.rollup.getSlotAt(BigInt(await this.cc.eth.timestamp()) + BigInt(this.ethereumSlotDuration));
    this.time = Number(await this.rollup.getTimestampForSlot(slot));
  }

  async progressSlots(diff: number, dateProvider?: TestDateProvider) {
    if (diff <= 1) {
      return;
    }

    const slot = await this.rollup.getSlotAt(BigInt(await this.cc.eth.timestamp()));
    const ts = Number(await this.rollup.getTimestampForSlot(slot + BigInt(diff)));
    const timeDiff = ts - this.time;
    this.time = ts;

    // Mine ethereum blocks such that the next block will be in a new slot
    await this.cc.eth.warp(this.time - this.ethereumSlotDuration);
    if (dateProvider) {
      dateProvider.setTime(this.time * 1000);
    }
    await this.cc.rollup.markAsProven(await this.rollup.getBlockNumber());
    this.accumulator = muldivDown(this.accumulator, computeMultiplier(this.rate, BigInt(timeDiff)), BASE);
  }

  depositPrivate(from: AztecAddress, onBehalfOf: Fr, amount: bigint) {
    this.collateralAsset.transferToPublic(from, this.lendingContract.address, amount);
    this.deposit(onBehalfOf, amount);
  }

  depositPublic(from: AztecAddress, onBehalfOf: Fr, amount: bigint) {
    this.collateralAsset.transferPublic(from, this.lendingContract.address, amount);
    this.deposit(onBehalfOf, amount);
  }

  private deposit(onBehalfOf: Fr, amount: bigint) {
    const coll = this.collateral[onBehalfOf.toString()] ?? Fr.ZERO;
    this.collateral[onBehalfOf.toString()] = new Fr(coll.value + amount);
  }

  withdraw(owner: Fr, recipient: AztecAddress, amount: bigint) {
    const coll = this.collateral[owner.toString()] ?? Fr.ZERO;
    this.collateral[owner.toString()] = new Fr(coll.value - amount);
    this.collateralAsset.transferPublic(this.lendingContract.address, recipient, amount);
  }

  borrow(owner: Fr, recipient: AztecAddress, amount: bigint) {
    const staticDebtBal = this.staticDebt[owner.toString()] ?? Fr.ZERO;
    const increase = muldivUp(amount, BASE, this.accumulator);
    this.staticDebt[owner.toString()] = new Fr(staticDebtBal.value + increase);

    this.stableCoin.mintPublic(recipient, amount);
    this.borrowed += amount;
  }

  repayPrivate(from: AztecAddress, onBehalfOf: Fr, amount: bigint) {
    this.stableCoin.burnPrivate(from, amount);
    this.repay(onBehalfOf, onBehalfOf, amount);
  }

  repayPublic(from: AztecAddress, onBehalfOf: Fr, amount: bigint) {
    this.stableCoin.burnPublic(from, amount);
    this.repay(onBehalfOf, onBehalfOf, amount);
  }

  private repay(from: Fr, onBehalfOf: Fr, amount: bigint) {
    const staticDebtBal = this.staticDebt[onBehalfOf.toString()] ?? Fr.ZERO;
    const decrease = muldivDown(amount, BASE, this.accumulator);
    this.staticDebt[onBehalfOf.toString()] = new Fr(staticDebtBal.value - decrease);

    this.borrowed -= amount;
  }

  mintStableCoinOutsideLoan(recipient: AztecAddress, amount: bigint, priv = false) {
    if (priv) {
      this.stableCoin.mintPrivate(recipient, amount);
    } else {
      this.stableCoin.mintPublic(recipient, amount);
    }
    this.mintedOutside += amount;
  }

  async check() {
    // Run checks on both underlying assets
    await this.collateralAsset.check();
    await this.stableCoin.check();

    // Check that total collateral equals total holdings by contract.
    const totalCollateral = Object.values(this.collateral).reduce((a, b) => new Fr(a.value + b.value), Fr.ZERO);
    expect(totalCollateral).toEqual(new Fr(this.collateralAsset.balanceOfPublic(this.lendingContract.address)));

    expect(this.borrowed).toEqual(this.stableCoin.totalSupply - this.mintedOutside);

    const asset = await this.lendingContract.methods.get_asset(0).simulate();

    const interestAccumulator = asset['interest_accumulator'];
    expect(interestAccumulator).toEqual(this.accumulator);
    expect(asset['last_updated_ts']).toEqual(BigInt(this.time));

    for (const key of [this.account.address, AztecAddress.fromField(await this.account.key())]) {
      const privatePos = await this.lendingContract.methods.get_position(key).simulate();
      expect(new Fr(privatePos['collateral'])).toEqual(this.collateral[key.toString()] ?? Fr.ZERO);
      expect(new Fr(privatePos['static_debt'])).toEqual(this.staticDebt[key.toString()] ?? Fr.ZERO);
      expect(privatePos['debt']).toEqual(
        muldivUp((this.staticDebt[key.toString()] ?? Fr.ZERO).value, this.accumulator, BASE),
      );
    }
  }
}
