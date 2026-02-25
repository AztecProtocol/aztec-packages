import type { EthAddress, SlotNumber } from '@aztec/foundation/schemas';

import { type MockProxy, mock, mockDeep } from 'jest-mock-extended';

import { EpochCache, type SlotTag } from '../epoch_cache.js';

/**
 * We often mock the epoch cache in unit tests, due to the view factory pattern, this can
 * become verbose.
 *
 * This doesnt do anything special, but removes some boiler plate - methods must still be stubbed
 * independently
 */
export function createMockEpochCache(): MockProxy<EpochCache> {
  const epochCache = mock<EpochCache>();
  addViewMock(epochCache);
  return epochCache;
}

export function createMockDeepEpochCache(): MockProxy<EpochCache> {
  const epochCache = mockDeep<EpochCache>();
  addViewMock(epochCache);
  return epochCache;
}

function addViewMock(epochCache: MockProxy<EpochCache>) {
  epochCache.getViewFactory.mockReturnValue({
    withProposerView: () => ({
      getCommittee: (slot?: SlotTag) => epochCache.getCommittee(slot),
      getProposerAttesterAddressInSlot: (slot: SlotNumber) => epochCache.getProposerAttesterAddressInSlot(slot),
      isInCommittee: (slot: SlotTag, validator: EthAddress) => epochCache.isInCommittee(slot, validator),
      filterInCommittee: (slot: SlotTag, validators: EthAddress[]) => epochCache.filterInCommittee(slot, validators),
      toBaseSlot: (slot: SlotNumber) => slot,
    }),
    withSubmissionView: () => ({
      getCommittee: (slot?: SlotTag) => epochCache.getCommittee(slot),
      getProposerAttesterAddressInSlot: (slot: SlotNumber) => epochCache.getProposerAttesterAddressInSlot(slot),
      isInCommittee: (slot: SlotTag, validator: EthAddress) => epochCache.isInCommittee(slot, validator),
      filterInCommittee: (slot: SlotTag, validators: EthAddress[]) => epochCache.filterInCommittee(slot, validators),
      toBaseSlot: (slot: SlotNumber) => slot,
    }),
  });
}
