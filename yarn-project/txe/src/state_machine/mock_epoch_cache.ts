import type {
  EpochAndSlot,
  EpochCacheInterface,
  EpochCacheViewFactory,
  EpochCommitteeInfo,
  SlotTag,
} from '@aztec/epoch-cache';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { EmptyL1RollupConstants, type L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

/**
 * Mock implementation of the EpochCacheInterface used to satisfy dependencies of AztecNodeService.
 * Since in TXE we don't validate transactions, mock suffices here.
 */
export class MockEpochCache implements EpochCacheInterface {
  private proposerPipeliningEnabled = true;
  private mapSlotForProposerView(slot: SlotTag): SlotTag {
    if (typeof slot !== 'number') {
      return slot;
    }
    const offset = this.proposerPipeliningEnabled ? 1 : 0;
    return SlotNumber(Math.max(0, Number(slot) + offset));
  }

  private makeView(mapSlot: (slot: SlotTag) => SlotTag, toBaseSlot: (slot: SlotNumber) => SlotNumber) {
    return {
      getCommittee: (slot: SlotTag = 'now') => this.getCommittee(mapSlot(slot)),
      getProposerAttesterAddressInSlot: (slot: SlotNumber) => this.getProposerAttesterAddressInSlot(toBaseSlot(slot)),
      isInCommittee: (slot: SlotTag, validator: EthAddress) => this.isInCommittee(mapSlot(slot), validator),
      filterInCommittee: (slot: SlotTag, validators: EthAddress[]) => this.filterInCommittee(mapSlot(slot), validators),
      toBaseSlot,
    };
  }

  getCommittee(_slot: SlotTag = 'now'): Promise<EpochCommitteeInfo> {
    return Promise.resolve({
      committee: undefined,
      seed: 0n,
      epoch: EpochNumber.ZERO,
      isEscapeHatchOpen: false,
    });
  }

  getEpochAndSlotNow(): EpochAndSlot & { nowMs: bigint } {
    return {
      epoch: EpochNumber.ZERO,
      slot: SlotNumber(0),
      ts: 0n,
      nowMs: 0n,
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

  getCurrentAndNextSlot(): { currentSlot: SlotNumber; nextSlot: SlotNumber } {
    return {
      currentSlot: SlotNumber(0),
      nextSlot: SlotNumber(0),
    };
  }

  getProposerAttesterAddressInSlot(_slot: SlotNumber): Promise<EthAddress | undefined> {
    return Promise.resolve(undefined);
  }

  setProposerPipeliningEnabled(enabled: boolean): void {
    this.proposerPipeliningEnabled = enabled;
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

  getL1Constants(): L1RollupConstants {
    return EmptyL1RollupConstants;
  }

  getViewFactory(): EpochCacheViewFactory {
    const proposerToBaseSlot = (slot: SlotNumber) => this.mapSlotForProposerView(slot) as SlotNumber;
    return {
      withProposerView: () => this.makeView(slot => this.mapSlotForProposerView(slot), proposerToBaseSlot),
      withSubmissionView: () =>
        this.makeView(
          slot => slot,
          slot => slot,
        ),
    };
  }
}
