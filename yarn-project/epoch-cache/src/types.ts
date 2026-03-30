import type { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

/** When proposer pipelining is enabled, the proposer builds one slot ahead. */
export const PROPOSER_PIPELINING_SLOT_OFFSET = 1;

/** Flat return type for compound epoch/slot getters. */
export type EpochAndSlot = {
  slot: SlotNumber;
  epoch: EpochNumber;
  ts: bigint;
};

export type EpochCommitteeInfo = {
  committee: EthAddress[] | undefined;
  seed: bigint;
  epoch: EpochNumber;
  /** True if the epoch is within an open escape hatch window. */
  isEscapeHatchOpen: boolean;
};

/** L1 rollup constants extended with the lag parameters used for committee computation. */
export type EpochCacheConstants = L1RollupConstants & {
  lagInEpochsForValidatorSet: number;
  lagInEpochsForRandao: number;
};

export type SlotTag = 'now' | 'next' | SlotNumber;

export interface EpochCacheInterface {
  getCommittee(slot: SlotTag | undefined): Promise<EpochCommitteeInfo>;
  getSlotNow(): SlotNumber;
  getTargetSlot(): SlotNumber;
  getEpochNow(): EpochNumber;
  getTargetEpoch(): EpochNumber;
  getEpochAndSlotNow(): EpochAndSlot & { nowMs: bigint };
  getEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint };
  /** Returns epoch/slot info for the next L1 slot with pipeline offset applied. */
  getTargetEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint };
  isProposerPipeliningEnabled(): boolean;
  isEscapeHatchOpen(epoch: EpochNumber): Promise<boolean>;
  isEscapeHatchOpenAtSlot(slot: SlotTag): Promise<boolean>;
  getProposerIndexEncoding(epoch: EpochNumber, slot: SlotNumber, seed: bigint): `0x${string}`;
  computeProposerIndex(slot: SlotNumber, epoch: EpochNumber, seed: bigint, size: bigint): bigint;
  getCurrentAndNextSlot(): { currentSlot: SlotNumber; nextSlot: SlotNumber };
  getTargetAndNextSlot(): { targetSlot: SlotNumber; nextSlot: SlotNumber };
  getProposerAttesterAddressInSlot(slot: SlotNumber): Promise<EthAddress | undefined>;
  getRegisteredValidators(): Promise<EthAddress[]>;
  isInCommittee(slot: SlotTag, validator: EthAddress): Promise<boolean>;
  filterInCommittee(slot: SlotTag, validators: EthAddress[]): Promise<EthAddress[]>;
  getL1Constants(): L1RollupConstants;
}
