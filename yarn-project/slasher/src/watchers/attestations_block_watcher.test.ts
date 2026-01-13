import type { EpochCache } from '@aztec/epoch-cache';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import {
  type InvalidCheckpointDetectedEvent,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
  type ValidateCheckpointNegativeResult,
} from '@aztec/stdlib/block';
import type { CheckpointInfo } from '@aztec/stdlib/checkpoint';
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
  let checkpointInfo: CheckpointInfo;
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
    checkpointInfo = {
      archive: Fr.random(),
      lastArchive: Fr.random(),
      slotNumber: SlotNumber(1),
      checkpointNumber: CheckpointNumber(1),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    };
    proposer = EthAddress.fromString('0x0000000000000000000000000000000000000abc');
    committee = [proposer, EthAddress.fromString('0x0000000000000000000000000000000000000def')];

    // Default mock return value
    epochCache.getProposerFromEpochCommittee.mockReturnValue(proposer);
  });

  afterEach(async () => {
    await watcher.stop();
  });

  it('should emit WANT_TO_SLASH_EVENT for proposer when invalid checkpoint detected due to insufficient attestations', async () => {
    const validationResult: ValidateCheckpointNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      checkpoint: checkpointInfo,
      committee,
      epoch: EpochNumber(1),
      seed: 0n,
      attestors: [],
      attestations: [],
    };

    const event: InvalidCheckpointDetectedEvent = {
      type: 'invalidCheckpointDetected',
      validationResult,
    };

    l2BlockSource.events.emit(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, event);

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

  it('should emit WANT_TO_SLASH_EVENT for proposer when invalid checkpoint detected due to invalid attestations', async () => {
    const validationResult: ValidateCheckpointNegativeResult = {
      valid: false,
      reason: 'invalid-attestation',
      checkpoint: checkpointInfo,
      committee,
      epoch: EpochNumber(1),
      seed: 0n,
      attestors: [],
      invalidIndex: 0,
      attestations: [],
    };

    const event: InvalidCheckpointDetectedEvent = {
      type: 'invalidCheckpointDetected',
      validationResult,
    };

    l2BlockSource.events.emit(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, event);

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

  it('should emit WANT_TO_SLASH_EVENT for attestors when checkpoint built on invalid parent', async () => {
    // First, emit an invalid checkpoint using the pre-configured data
    const invalidCheckpointValidationResult: ValidateCheckpointNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      checkpoint: checkpointInfo,
      committee,
      epoch: EpochNumber(1),
      seed: 0n,
      attestors: [],
      attestations: [],
    };

    const invalidCheckpointEvent: InvalidCheckpointDetectedEvent = {
      type: 'invalidCheckpointDetected',
      validationResult: invalidCheckpointValidationResult,
    };

    l2BlockSource.events.emit(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, invalidCheckpointEvent);

    await sleep(100);

    // Now emit a checkpoint that builds on the invalid checkpoint
    const childCheckpointInfo: CheckpointInfo = {
      archive: Fr.random(),
      lastArchive: checkpointInfo.archive, // Parent archive
      slotNumber: SlotNumber(2),
      checkpointNumber: CheckpointNumber(2),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    };
    const proposer2 = EthAddress.fromString('0x0000000000000000000000000000000000000def');

    epochCache.getProposerFromEpochCommittee.mockReturnValue(proposer2);

    const attestor1 = EthAddress.fromString('0x0000000000000000000000000000000000000111');
    const attestor2 = EthAddress.fromString('0x0000000000000000000000000000000000000222');

    const childValidationResult: ValidateCheckpointNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      checkpoint: childCheckpointInfo,
      committee: [proposer2, attestor1, attestor2],
      epoch: EpochNumber(1),
      seed: 0n,
      attestors: [attestor1, attestor2],
      attestations: [],
    };

    const childEvent: InvalidCheckpointDetectedEvent = {
      type: 'invalidCheckpointDetected',
      validationResult: childValidationResult,
    };

    handler.mockClear();
    l2BlockSource.events.emit(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, childEvent);

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

  it('should not process the same invalid checkpoint twice', async () => {
    const validationResult: ValidateCheckpointNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      checkpoint: checkpointInfo,
      committee,
      epoch: EpochNumber(1),
      seed: 0n,
      attestors: [],
      attestations: [],
    };

    const event: InvalidCheckpointDetectedEvent = {
      type: 'invalidCheckpointDetected',
      validationResult,
    };

    // Emit the same event twice
    l2BlockSource.events.emit(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, event);
    await sleep(100);
    l2BlockSource.events.emit(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, event);
    await sleep(100);

    // Should only emit once
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should handle case when no proposer is found', async () => {
    epochCache.getProposerFromEpochCommittee.mockReturnValue(undefined);

    const validationResult: ValidateCheckpointNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      checkpoint: checkpointInfo,
      committee,
      epoch: EpochNumber(1),
      seed: 0n,
      attestors: [],
      attestations: [],
    };

    const event: InvalidCheckpointDetectedEvent = {
      type: 'invalidCheckpointDetected',
      validationResult,
    };

    l2BlockSource.events.emit(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, event);

    await sleep(100);

    // Should not emit any events
    expect(handler).not.toHaveBeenCalled();
  });
});

class MockL2BlockSource {
  public readonly events = new EventEmitter();

  constructor() {}
}
