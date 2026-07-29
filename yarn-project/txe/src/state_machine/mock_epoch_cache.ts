import type { EpochAndSlot, EpochCacheInterface, EpochCommitteeInfo, SlotTag } from '@aztec/epoch-cache';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { EmptyL1RollupConstants, type L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

/**
 * Mock implementation of the EpochCacheInterface used to satisfy dependencies of AztecNodeService.
 * Since in TXE we don't validate transactions, mock suffices here.
 */
export class MockEpochCache implements EpochCacheInterface {
  getCommittee(_slot: SlotTag = 'now'): Promise<EpochCommitteeInfo> {
    return Promise.resolve({
      committee: undefined,
      seed: 0n,
      epoch: EpochNumber.ZERO,
      isEscapeHatchOpen: false,
    });
  }

  getSlotNow(): SlotNumber {
    return SlotNumber(0);
  }

  getTargetSlot(): SlotNumber {
    return SlotNumber(0);
  }

  getEpochNow(): EpochNumber {
    return EpochNumber.ZERO;
  }

  getTargetEpoch(): EpochNumber {
    return EpochNumber.ZERO;
  }

  getEpochAndSlotNow(): EpochAndSlot & { nowMs: bigint } {
    return {
      epoch: EpochNumber.ZERO,
      slot: SlotNumber(0),
      ts: 0n,
      nowMs: 0n,
    };
  }

  getEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint } {
    return {
      epoch: EpochNumber.ZERO,
      slot: SlotNumber(0),
      ts: 0n,
      nowSeconds: 0n,
    };
  }

  getTargetEpochAndSlotInNextL1Slot(): EpochAndSlot & { nowSeconds: bigint } {
    return this.getEpochAndSlotInNextL1Slot();
  }

  getProposerIndexEncoding(_epoch: EpochNumber, _slot: SlotNumber, _seed: bigint): `0x${string}` {
    return '0x00';
  }

  computeProposerIndex(_slot: SlotNumber, _epoch: EpochNumber, _seed: bigint, _size: bigint): bigint {
    return 0n;
  }

  getCurrentAndNextSlot(): { currentSlot: SlotNumber; nextSlot: SlotNumber } {
    return {
      currentSlot: SlotNumber(0),
      nextSlot: SlotNumber(0),
    };
  }

  getTargetAndNextSlot(): { targetSlot: SlotNumber; nextSlot: SlotNumber } {
    return {
      targetSlot: SlotNumber(0),
      nextSlot: SlotNumber(0),
    };
  }

  getProposerAttesterAddressInSlot(_slot: SlotNumber): Promise<EthAddress | undefined> {
    return Promise.resolve(undefined);
  }

  isInCommittee(_slot: SlotTag, _validator: EthAddress): Promise<boolean> {
    return Promise.resolve(false);
  }

  getRegisteredValidators(): Promise<EthAddress[]> {
    return Promise.resolve([]);
  }

  filterInCommittee(_slot: SlotTag, _validators: EthAddress[]): Promise<EthAddress[]> {
    return Promise.resolve([]);
  }

  isEscapeHatchOpen(_epoch: EpochNumber): Promise<boolean> {
    return Promise.resolve(false);
  }

  isEscapeHatchOpenAtSlot(_slot: SlotTag): Promise<boolean> {
    return Promise.resolve(false);
  }

  getL1Constants(): L1RollupConstants {
    return EmptyL1RollupConstants;
  }

  getLagInEpochsForValidatorSet(): number {
    return 0;
  }
}
