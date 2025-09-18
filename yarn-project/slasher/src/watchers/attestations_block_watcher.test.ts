import type { EpochCache } from '@aztec/epoch-cache';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import {
  type InvalidBlockDetectedEvent,
  L2Block,
  type L2BlockInfo,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
  type ValidateBlockNegativeResult,
} from '@aztec/stdlib/block';
import { OffenseType } from '@aztec/stdlib/slashing';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import EventEmitter from 'node:events';

import { DefaultSlasherConfig, type SlasherConfig } from '../config.js';
import { WANT_TO_SLASH_EVENT, type WantToSlashArgs } from '../watcher.js';
import { AttestationsBlockWatcher } from './attestations_block_watcher.js';

describe('AttestationsBlockWatcher', () => {
  let watcher: AttestationsBlockWatcher;
  let l2BlockSource: L2BlockSourceEventEmitter;
  let epochCache: MockProxy<EpochCache>;
  let config: SlasherConfig;
  let handler: jest.MockedFunction<(args: WantToSlashArgs[]) => void>;
  let block: L2Block;
  let l2BlockInfo: L2BlockInfo;
  let proposer: EthAddress;
  let committee: EthAddress[];

  beforeEach(async () => {
    l2BlockSource = new MockL2BlockSource() as unknown as L2BlockSourceEventEmitter;
    epochCache = mock<EpochCache>();
    config = DefaultSlasherConfig;
    handler = jest.fn();

    watcher = new AttestationsBlockWatcher(l2BlockSource, epochCache, config);
    watcher.on(WANT_TO_SLASH_EVENT, handler);
    await watcher.start();

    // Set up common test data
    block = await L2Block.random(1, 4);
    l2BlockInfo = block.toBlockInfo();
    proposer = EthAddress.fromString('0x0000000000000000000000000000000000000abc');
    committee = [proposer, EthAddress.fromString('0x0000000000000000000000000000000000000def')];

    // Default mock return value
    epochCache.getProposerFromEpochCommittee.mockReturnValue(proposer);
  });

  afterEach(async () => {
    await watcher.stop();
  });

  it('should emit WANT_TO_SLASH_EVENT for proposer when invalid block detected due to insufficient attestations', async () => {
    const validationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      block: l2BlockInfo,
      committee,
      epoch: 1n,
      seed: 0n,
      attestors: [],
      attestations: [],
    };

    const event: InvalidBlockDetectedEvent = {
      type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
      validationResult,
    };

    l2BlockSource.emit(L2BlockSourceEvents.InvalidAttestationsBlockDetected, event);

    await sleep(100);

    expect(handler).toHaveBeenCalledWith([
      {
        validator: proposer,
        amount: config.slashProposeInvalidAttestationsPenalty,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot: 1n,
      } satisfies WantToSlashArgs,
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should emit WANT_TO_SLASH_EVENT for proposer when invalid block detected due to invalid attestations', async () => {
    const validationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'invalid-attestation',
      block: l2BlockInfo,
      committee,
      epoch: 1n,
      seed: 0n,
      attestors: [],
      invalidIndex: 0,
      attestations: [],
    };

    const event: InvalidBlockDetectedEvent = {
      type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
      validationResult,
    };

    l2BlockSource.emit(L2BlockSourceEvents.InvalidAttestationsBlockDetected, event);

    await sleep(100);

    expect(handler).toHaveBeenCalledWith([
      {
        validator: proposer,
        amount: config.slashProposeInvalidAttestationsPenalty,
        offenseType: OffenseType.PROPOSED_INCORRECT_ATTESTATIONS,
        epochOrSlot: 1n,
      } satisfies WantToSlashArgs,
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should emit WANT_TO_SLASH_EVENT for attestors when block built on invalid parent', async () => {
    // First, emit an invalid block using the pre-configured data
    const invalidBlockValidationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      block: l2BlockInfo,
      committee,
      epoch: 1n,
      seed: 0n,
      attestors: [],
      attestations: [],
    };

    const invalidBlockEvent: InvalidBlockDetectedEvent = {
      type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
      validationResult: invalidBlockValidationResult,
    };

    l2BlockSource.emit(L2BlockSourceEvents.InvalidAttestationsBlockDetected, invalidBlockEvent);

    await sleep(100);

    // Now emit a block that builds on the invalid block
    const childBlock = await L2Block.random(2, 4);
    childBlock.header.lastArchive.root = block.archive.root;
    const childBlockInfo = childBlock.toBlockInfo();
    const proposer2 = EthAddress.fromString('0x0000000000000000000000000000000000000def');

    epochCache.getProposerFromEpochCommittee.mockReturnValue(proposer2);

    const attestor1 = EthAddress.fromString('0x0000000000000000000000000000000000000111');
    const attestor2 = EthAddress.fromString('0x0000000000000000000000000000000000000222');

    const childValidationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      block: childBlockInfo,
      committee: [proposer2, attestor1, attestor2],
      epoch: 1n,
      seed: 0n,
      attestors: [attestor1, attestor2],
      attestations: [],
    };

    const childEvent: InvalidBlockDetectedEvent = {
      type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
      validationResult: childValidationResult,
    };

    handler.mockClear();
    l2BlockSource.emit(L2BlockSourceEvents.InvalidAttestationsBlockDetected, childEvent);

    await sleep(100);

    expect(handler).toHaveBeenCalledWith([
      {
        validator: proposer2,
        amount: config.slashProposeInvalidAttestationsPenalty,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot: 2n,
      } satisfies WantToSlashArgs,
    ]);

    expect(handler).toHaveBeenCalledWith([
      {
        validator: attestor1,
        amount: config.slashAttestDescendantOfInvalidPenalty,
        offenseType: OffenseType.ATTESTED_DESCENDANT_OF_INVALID,
        epochOrSlot: 2n,
      },
      {
        validator: attestor2,
        amount: config.slashAttestDescendantOfInvalidPenalty,
        offenseType: OffenseType.ATTESTED_DESCENDANT_OF_INVALID,
        epochOrSlot: 2n,
      },
    ] satisfies WantToSlashArgs[]);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should not process the same invalid block twice', async () => {
    const validationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      block: l2BlockInfo,
      committee,
      epoch: 1n,
      seed: 0n,
      attestors: [],
      attestations: [],
    };

    const event: InvalidBlockDetectedEvent = {
      type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
      validationResult,
    };

    // Emit the same event twice
    l2BlockSource.emit(L2BlockSourceEvents.InvalidAttestationsBlockDetected, event);
    await sleep(100);
    l2BlockSource.emit(L2BlockSourceEvents.InvalidAttestationsBlockDetected, event);
    await sleep(100);

    // Should only emit once
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should handle case when no proposer is found', async () => {
    epochCache.getProposerFromEpochCommittee.mockReturnValue(undefined);

    const validationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      block: l2BlockInfo,
      committee,
      epoch: 1n,
      seed: 0n,
      attestors: [],
      attestations: [],
    };

    const event: InvalidBlockDetectedEvent = {
      type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
      validationResult,
    };

    l2BlockSource.emit(L2BlockSourceEvents.InvalidAttestationsBlockDetected, event);

    await sleep(100);

    // Should not emit any events
    expect(handler).not.toHaveBeenCalled();
  });
});

class MockL2BlockSource extends EventEmitter {
  constructor() {
    super();
  }
}
