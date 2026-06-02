// Convenience struct to hold an account's address and secret that can easily be passed around.
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { CheatCodes } from '@aztec/aztec/testing';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import type { TestDateProvider } from '@aztec/foundation/timer';
import type { LendingContract } from '@aztec/noir-contracts.js/Lending';
import type { AztecNode, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';

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
    return poseidon2Hash([this.address, this.secret]);
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

  prepare() {
    this.accumulator = BASE;
    this.time = 0;
  }

  /**
   * Advances the simulator's accumulator and clock to match a block timestamp observed on chain.
   * Call this BEFORE applying any accumulator-sensitive mutation (borrow/repay) so the mutation
   * sees the same accumulator as the contract did during execution.
   */
  observeBlockTimestamp(ts: number) {
    const diff = ts - this.time;
    if (diff > 0) {
      this.accumulator = muldivDown(this.accumulator, computeMultiplier(this.rate, BigInt(diff)), BASE);
    }
    this.time = ts;
  }

  async progressSlots(diff: number, _dateProvider?: TestDateProvider, node?: AztecNode & AztecNodeDebug) {
    if (diff <= 1) {
      return;
    }

    const slot = await this.rollup.getSlotAt(BigInt(await this.cc.eth.lastBlockTimestamp()));
    const targetSlot = SlotNumber(slot + diff);
    const ts = Number(await this.rollup.getTimestampForSlot(targetSlot));

    // Queue-aware warp under AutomineSequencer: atomic warp + mineBlock that advances L2 time to the
    // target slot. The cheat code routes through the AutomineSequencer queue when one is installed,
    // and otherwise falls back to a manual warp + mineBlock loop.
    if (node) {
      await this.cc.warpL2TimeAtLeastTo(node, ts);
    } else {
      await this.cc.eth.warp(ts - this.ethereumSlotDuration);
    }

    // Mark the latest checkpoint as proven so the rollup does not reorg pending checkpoints when
    // time jumps far enough forward to cross an unproven epoch boundary.
    await this.cc.rollup.markAsProven(await this.rollup.getCheckpointNumber());
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

    const { result: asset } = await this.lendingContract.methods.get_asset(0).simulate({ from: this.account.address });

    const interestAccumulator = asset['interest_accumulator'];
    expect(interestAccumulator).toEqual(this.accumulator);
    expect(asset['last_updated_ts']).toEqual(BigInt(this.time));

    for (const key of [this.account.address, AztecAddress.fromField(await this.account.key())]) {
      const { result: privatePos } = await this.lendingContract.methods
        .get_position(key)
        .simulate({ from: this.account.address });
      expect(new Fr(privatePos['collateral'])).toEqual(this.collateral[key.toString()] ?? Fr.ZERO);
      expect(new Fr(privatePos['static_debt'])).toEqual(this.staticDebt[key.toString()] ?? Fr.ZERO);
      expect(privatePos['debt']).toEqual(
        muldivUp((this.staticDebt[key.toString()] ?? Fr.ZERO).value, this.accumulator, BASE),
      );
    }
  }
}
