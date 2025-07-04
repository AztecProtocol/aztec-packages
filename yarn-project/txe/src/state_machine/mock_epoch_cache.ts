import type { EpochAndSlot, EpochCacheInterface, EpochCommitteeInfo } from '@aztec/epoch-cache';
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
      epoch: 0n,
    });
  }

  getEpochAndSlotNow(): EpochAndSlot {
    return {
      epoch: 0n,
      slot: 0n,
      ts: 0n,
    };
  }

  getEpochAndSlotInNextL1Slot(): EpochAndSlot & { now: bigint } {
    return {
      epoch: 0n,
      slot: 0n,
      ts: 0n,
      now: 0n,
    };
  }

  getProposerIndexEncoding(_epoch: bigint, _slot: bigint, _seed: bigint): `0x${string}` {
    return '0x00';
  }

  computeProposerIndex(_slot: bigint, _epoch: bigint, _seed: bigint, _size: bigint): bigint {
    return 0n;
  }

  getProposerAttesterAddressInCurrentOrNextSlot(): Promise<{
    currentProposer: EthAddress | undefined;
    nextProposer: EthAddress | undefined;
    currentSlot: bigint;
    nextSlot: bigint;
  }> {
    return Promise.resolve({
      currentProposer: undefined,
      nextProposer: undefined,
      currentSlot: 0n,
      nextSlot: 0n,
    });
  }

  isInCommittee(_validator: EthAddress): Promise<boolean> {
    return Promise.resolve(false);
  }

  getRegisteredValidators(): Promise<EthAddress[]> {
    return Promise.resolve([]);
  }
}
