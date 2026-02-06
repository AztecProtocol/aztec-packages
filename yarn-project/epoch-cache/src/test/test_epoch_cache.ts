import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { getEpochAtSlot, getSlotAtTimestamp, getTimestampRangeForEpoch } from '@aztec/stdlib/epoch-helpers';

import type { EpochAndSlot, EpochCacheInterface, EpochCommitteeInfo, SlotTag } from '../epoch_cache.js';

/** Default L1 constants for testing. */
const DEFAULT_L1_CONSTANTS: L1RollupConstants = {
  l1StartBlock: 0n,
  l1GenesisTime: 0n,
  slotDuration: 24,
  epochDuration: 16,
  ethereumSlotDuration: 12,
  proofSubmissionEpochs: 2,
};

/**
 * A test implementation of EpochCacheInterface that allows manual configuration
 * of committee, proposer, slot, and escape hatch state for use in tests.
 *
 * Unlike the real EpochCache, this class doesn't require any RPC connections
 * or mock setup. Simply use the setter methods to configure the test state.
 */
export class TestEpochCache implements EpochCacheInterface {
  private committee: EthAddress[] = [];
  private proposerAddress: EthAddress | undefined;
  private currentSlot: SlotNumber = SlotNumber(0);
  private escapeHatchOpen: boolean = false;
  private seed: bigint = 0n;
  private registeredValidators: EthAddress[] = [];
  private l1Constants: L1RollupConstants;

  constructor(l1Constants: Partial<L1RollupConstants> = {}) {
    this.l1Constants = { ...DEFAULT_L1_CONSTANTS, ...l1Constants };
  }

  /**
   * Sets the committee members. Used in validation and attestation flows.
   * @param committee - Array of committee member addresses.
   */
  setCommittee(committee: EthAddress[]): this {
    this.committee = committee;
    return this;
  }

  /**
   * Sets the proposer address returned by getProposerAttesterAddressInSlot.
   * @param proposer - The address of the current proposer.
   */
  setProposer(proposer: EthAddress | undefined): this {
    this.proposerAddress = proposer;
    return this;
  }

  /**
   * Sets the current slot number.
   * @param slot - The slot number to set.
   */
  setCurrentSlot(slot: SlotNumber): this {
    this.currentSlot = slot;
    return this;
  }

  /**
   * Sets whether the escape hatch is open.
   * @param open - True if escape hatch should be open.
   */
  setEscapeHatchOpen(open: boolean): this {
    this.escapeHatchOpen = open;
    return this;
  }

  /**
   * Sets the randomness seed used for proposer selection.
   * @param seed - The seed value.
   */
  setSeed(seed: bigint): this {
    this.seed = seed;
    return this;
  }

  /**
   * Sets the list of registered validators (all validators, not just committee).
   * @param validators - Array of validator addresses.
   */
  setRegisteredValidators(validators: EthAddress[]): this {
    this.registeredValidators = validators;
    return this;
  }

  /**
   * Sets the L1 constants used for epoch/slot calculations.
   * @param constants - Partial constants to override defaults.
   */
  setL1Constants(constants: Partial<L1RollupConstants>): this {
    this.l1Constants = { ...this.l1Constants, ...constants };
    return this;
  }

  getL1Constants(): L1RollupConstants {
    return this.l1Constants;
  }

  getCommittee(_slot?: SlotTag): Promise<EpochCommitteeInfo> {
    const epoch = getEpochAtSlot(this.currentSlot, this.l1Constants);
    return Promise.resolve({
      committee: this.committee,
      epoch,
      seed: this.seed,
      isEscapeHatchOpen: this.escapeHatchOpen,
    });
  }

  getEpochAndSlotNow(): EpochAndSlot & { nowMs: bigint } {
    const epoch = getEpochAtSlot(this.currentSlot, this.l1Constants);
    const ts = getTimestampRangeForEpoch(epoch, this.l1Constants)[0];
    return { epoch, slot: this.currentSlot, ts, nowMs: ts * 1000n };
  }

  getEpochAndSlotInNextL1Slot(): EpochAndSlot & { now: bigint } {
    const now = getTimestampRangeForEpoch(getEpochAtSlot(this.currentSlot, this.l1Constants), this.l1Constants)[0];
    const nextSlotTs = now + BigInt(this.l1Constants.ethereumSlotDuration);
    const nextSlot = getSlotAtTimestamp(nextSlotTs, this.l1Constants);
    const epoch = getEpochAtSlot(nextSlot, this.l1Constants);
    const ts = getTimestampRangeForEpoch(epoch, this.l1Constants)[0];
    return { epoch, slot: nextSlot, ts, now };
  }

  getProposerIndexEncoding(epoch: EpochNumber, slot: SlotNumber, seed: bigint): `0x${string}` {
    // Simple encoding for testing purposes
    return `0x${epoch.toString(16).padStart(64, '0')}${slot.toString(16).padStart(64, '0')}${seed.toString(16).padStart(64, '0')}`;
  }

  computeProposerIndex(slot: SlotNumber, _epoch: EpochNumber, _seed: bigint, size: bigint): bigint {
    if (size === 0n) {
      return 0n;
    }
    return BigInt(slot) % size;
  }

  getCurrentAndNextSlot(): { currentSlot: SlotNumber; nextSlot: SlotNumber } {
    return {
      currentSlot: this.currentSlot,
      nextSlot: SlotNumber(this.currentSlot + 1),
    };
  }

  getProposerAttesterAddressInSlot(_slot: SlotNumber): Promise<EthAddress | undefined> {
    return Promise.resolve(this.proposerAddress);
  }

  getRegisteredValidators(): Promise<EthAddress[]> {
    return Promise.resolve(this.registeredValidators);
  }

  isInCommittee(_slot: SlotTag, validator: EthAddress): Promise<boolean> {
    return Promise.resolve(this.committee.some(v => v.equals(validator)));
  }

  filterInCommittee(_slot: SlotTag, validators: EthAddress[]): Promise<EthAddress[]> {
    const committeeSet = new Set(this.committee.map(v => v.toString()));
    return Promise.resolve(validators.filter(v => committeeSet.has(v.toString())));
  }

  isEscapeHatchOpenAtSlot(_slot?: SlotTag): Promise<boolean> {
    return Promise.resolve(this.escapeHatchOpen);
  }
}
