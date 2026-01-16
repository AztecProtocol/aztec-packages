import type { EpochAndSlot, EpochCacheInterface, EpochCommitteeInfo, SlotTag } from '@aztec/epoch-cache';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';

/**
 * Mock implementation of the EpochCacheInterface used to satisfy dependencies of AztecNodeService.
 * Since in TXE we don't validate transactions, mock suffices here.
 */
export class MockEpochCache implements EpochCacheInterface {
  getCommittee(): Promise<EpochCommitteeInfo> {
    return Promise.resolve({
      committee: undefined,
      seed: 0n,
      epoch: EpochNumber.ZERO,
    });
  }

  getEpochAndSlotNow(): EpochAndSlot {
    return {
      epoch: EpochNumber.ZERO,
      slot: SlotNumber(0),
      ts: 0n,
    };
  }

  getEpochAndSlotInNextL1Slot(): EpochAndSlot & { now: bigint } {
    return {
      epoch: EpochNumber.ZERO,
      slot: SlotNumber(0),
      ts: 0n,
      now: 0n,
    };
  }

  getProposerIndexEncoding(_epoch: EpochNumber, _slot: SlotNumber, _seed: bigint): `0x${string}` {
    return '0x00';
  }

  computeProposerIndex(_slot: SlotNumber, _epoch: EpochNumber, _seed: bigint, _size: bigint): bigint {
    return 0n;
  }

  getProposerAttesterAddressInCurrentOrNextSlot(): Promise<{
    currentProposer: EthAddress | undefined;
    nextProposer: EthAddress | undefined;
    currentSlot: SlotNumber;
    nextSlot: SlotNumber;
  }> {
    return Promise.resolve({
      currentProposer: undefined,
      nextProposer: undefined,
      currentSlot: SlotNumber(0),
      nextSlot: SlotNumber(0),
    });
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
}
