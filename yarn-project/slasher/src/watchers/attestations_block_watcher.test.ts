import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type {
  DescendentOfInvalidAttestationsCheckpointEvent,
  InvalidCheckpointDetectedEvent,
  L2BlockSourceEventEmitter,
  ValidateCheckpointNegativeResult,
} from '@aztec/stdlib/block';
import type { CheckpointInfo } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { OffenseType } from '@aztec/stdlib/slashing';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { DefaultSlasherConfig, type SlasherConfig } from '../config.js';
import { WANT_TO_SLASH_EVENT, type WantToSlashArgs } from '../watcher.js';
import { AttestationsBlockWatcher } from './attestations_block_watcher.js';

describe('AttestationsBlockWatcher', () => {
  let watcher: AttestationsBlockWatcher;
  let epochCache: MockProxy<EpochCache>;
  let config: SlasherConfig;
  let handler: jest.MockedFunction<(args: WantToSlashArgs[]) => void>;
  let checkpointInfo: CheckpointInfo;
  let proposer: EthAddress;
  let committee: EthAddress[];

  beforeEach(() => {
    epochCache = mock<EpochCache>();
    config = DefaultSlasherConfig;
    handler = jest.fn();

    watcher = new AttestationsBlockWatcher(mock<L2BlockSourceEventEmitter>(), epochCache, config);
    watcher.on(WANT_TO_SLASH_EVENT, handler);

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

    // Default mock return values
    epochCache.getProposerFromEpochCommittee.mockReturnValue(proposer);
    epochCache.getL1Constants.mockReturnValue({ epochDuration: 32 } as L1RollupConstants);
    epochCache.getCommitteeForEpoch.mockResolvedValue({
      committee,
      seed: 0n,
      epoch: EpochNumber(0),
      isEscapeHatchOpen: false,
    } as EpochCommitteeInfo);
  });

  it('should emit WANT_TO_SLASH_EVENT for proposer when invalid checkpoint detected due to insufficient attestations', () => {
    const validationResult: ValidateCheckpointNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      checkpoint: checkpointInfo,
      committee,
      epoch: EpochNumber(1),
      seed: 0n,
      attestors: [],
      attestations: [],
      packedAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
    };

    const event: InvalidCheckpointDetectedEvent = {
      type: 'invalidCheckpointDetected',
      validationResult,
    };

    watcher.handleInvalidCheckpoint(event);

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

  it('should emit WANT_TO_SLASH_EVENT for proposer when invalid checkpoint detected due to invalid attestations', () => {
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
      packedAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
    };

    const event: InvalidCheckpointDetectedEvent = {
      type: 'invalidCheckpointDetected',
      validationResult,
    };

    watcher.handleInvalidCheckpoint(event);

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

  it('emits both an invalid-attestations slash and a descendant slash for a checkpoint that has invalid attestations and builds on an invalid ancestor', async () => {
    // A checkpoint that both has invalid attestations of its own and extends a previously-rejected
    // ancestor produces two offenses. The archiver reports each via its own event, so the watcher sees
    // an invalidCheckpointDetected (own attestations) and a descendentOfInvalidAttestationsCheckpointDetected
    // (extends a rejected ancestor) for the same checkpoint.
    const childCheckpointInfo: CheckpointInfo = {
      archive: Fr.random(),
      lastArchive: checkpointInfo.archive, // Parent archive (the rejected ancestor)
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
      packedAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
    };

    // First event: slash the proposer for the invalid attestations on its own checkpoint.
    watcher.handleInvalidCheckpoint({
      type: 'invalidCheckpointDetected',
      validationResult: childValidationResult,
    });

    expect(handler).toHaveBeenCalledWith([
      {
        validator: proposer2,
        amount: config.slashProposeInvalidAttestationsPenalty,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot: 2n,
      } satisfies WantToSlashArgs,
    ]);

    // Second event: slash the same proposer for building on the rejected ancestor.
    await watcher.handleDescendantOfInvalid({
      type: 'descendentOfInvalidAttestationsCheckpointDetected',
      checkpoint: childCheckpointInfo,
      ancestorArchiveRoot: checkpointInfo.archive,
      ancestorCheckpointNumber: checkpointInfo.checkpointNumber,
    });

    expect(handler).toHaveBeenCalledWith([
      {
        validator: proposer2,
        amount: config.slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty,
        offenseType: OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS,
        epochOrSlot: 2n,
      } satisfies WantToSlashArgs,
    ]);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('emits WANT_TO_SLASH_EVENT for proposer when a valid-attestations descendant of an invalid checkpoint is detected', async () => {
    // Seed the watcher with one invalid ancestor so the descendant event hits the cache.
    const invalidValidationResult: ValidateCheckpointNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      checkpoint: checkpointInfo,
      committee,
      epoch: EpochNumber(1),
      seed: 0n,
      attestors: [],
      attestations: [],
      packedAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
    };
    watcher.handleInvalidCheckpoint({
      type: 'invalidCheckpointDetected',
      validationResult: invalidValidationResult,
    });

    handler.mockClear();

    const descendantCheckpointInfo: CheckpointInfo = {
      archive: Fr.random(),
      lastArchive: checkpointInfo.archive,
      slotNumber: SlotNumber(2),
      checkpointNumber: CheckpointNumber(2),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    };
    const descendantProposer = EthAddress.fromString('0x0000000000000000000000000000000000000def');
    epochCache.getProposerFromEpochCommittee.mockReturnValue(descendantProposer);

    const event: DescendentOfInvalidAttestationsCheckpointEvent = {
      type: 'descendentOfInvalidAttestationsCheckpointDetected',
      checkpoint: descendantCheckpointInfo,
      ancestorArchiveRoot: checkpointInfo.archive,
      ancestorCheckpointNumber: checkpointInfo.checkpointNumber,
    };

    await watcher.handleDescendantOfInvalid(event);

    expect(handler).toHaveBeenCalledWith([
      {
        validator: descendantProposer,
        amount: config.slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty,
        offenseType: OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS,
        epochOrSlot: 2n,
      } satisfies WantToSlashArgs,
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('slashes a further descendant that both has invalid attestations and extends another descendant', async () => {
    // The archiver tracks the rejected chain and reports each descendant via its own event. A further
    // descendant (D2) that both has its own invalid attestations and extends an earlier descendant (D1)
    // is reported through two events; the watcher slashes its proposer for each offense independently.
    const d2: CheckpointInfo = {
      archive: Fr.random(),
      lastArchive: Fr.random(),
      slotNumber: SlotNumber(3),
      checkpointNumber: CheckpointNumber(3),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    };
    const d2Proposer = EthAddress.fromString('0x0000000000000000000000000000000000000bbb');
    epochCache.getProposerFromEpochCommittee.mockReturnValue(d2Proposer);

    // D2 has invalid attestations of its own.
    watcher.handleInvalidCheckpoint({
      type: 'invalidCheckpointDetected',
      validationResult: {
        valid: false,
        reason: 'insufficient-attestations',
        checkpoint: d2,
        committee,
        epoch: EpochNumber(1),
        seed: 0n,
        attestors: [],
        attestations: [],
        packedAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
      },
    });

    expect(handler).toHaveBeenCalledWith([
      {
        validator: d2Proposer,
        amount: config.slashProposeInvalidAttestationsPenalty,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot: 3n,
      } satisfies WantToSlashArgs,
    ]);

    // D2 also extends an earlier descendant of an invalid checkpoint.
    await watcher.handleDescendantOfInvalid({
      type: 'descendentOfInvalidAttestationsCheckpointDetected',
      checkpoint: d2,
      ancestorArchiveRoot: Fr.random(),
      ancestorCheckpointNumber: CheckpointNumber(1),
    });

    expect(handler).toHaveBeenCalledWith([
      {
        validator: d2Proposer,
        amount: config.slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty,
        offenseType: OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS,
        epochOrSlot: 3n,
      } satisfies WantToSlashArgs,
    ]);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('handles descendant-of-invalid event when no proposer is found', async () => {
    epochCache.getProposerFromEpochCommittee.mockReturnValue(undefined);

    const descendant: CheckpointInfo = {
      archive: Fr.random(),
      lastArchive: Fr.random(),
      slotNumber: SlotNumber(2),
      checkpointNumber: CheckpointNumber(2),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    };
    await watcher.handleDescendantOfInvalid({
      type: 'descendentOfInvalidAttestationsCheckpointDetected',
      checkpoint: descendant,
      ancestorArchiveRoot: Fr.random(),
      ancestorCheckpointNumber: CheckpointNumber(1),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle case when no proposer is found', () => {
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
      packedAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
    };

    const event: InvalidCheckpointDetectedEvent = {
      type: 'invalidCheckpointDetected',
      validationResult,
    };

    watcher.handleInvalidCheckpoint(event);

    // Should not emit any events
    expect(handler).not.toHaveBeenCalled();
  });
});
