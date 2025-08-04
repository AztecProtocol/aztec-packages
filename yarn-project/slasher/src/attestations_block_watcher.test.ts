import type { EpochCache } from '@aztec/epoch-cache';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import {
  type InvalidBlockDetectedEvent,
  L2Block,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
  PublishedL2Block,
  type ValidateBlockNegativeResult,
} from '@aztec/stdlib/block';
import { BlockAttestation } from '@aztec/stdlib/p2p';
import { Offense } from '@aztec/stdlib/slashing';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import EventEmitter from 'node:events';

import { AttestationsBlockWatcher } from './attestations_block_watcher.js';
import { DefaultSlasherConfig, type SlasherConfig, WANT_TO_SLASH_EVENT } from './config.js';

describe('AttestationsBlockWatcher', () => {
  let watcher: AttestationsBlockWatcher;
  let l2BlockSource: L2BlockSourceEventEmitter;
  let epochCache: MockProxy<EpochCache>;
  let config: SlasherConfig;
  let handler: jest.MockedFunction<any>;
  let block: L2Block;
  let publishedBlock: PublishedL2Block;
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
    publishedBlock = new PublishedL2Block(block, { blockNumber: BigInt(1) } as any, []);
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
      block: publishedBlock,
      committee,
      epoch: 1n,
      seed: 0n,
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
        offense: Offense.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      },
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should emit WANT_TO_SLASH_EVENT for proposer when invalid block detected due to invalid attestations', async () => {
    const validationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'invalid-attestation',
      block: publishedBlock,
      committee,
      epoch: 1n,
      seed: 0n,
      attestations: [],
      invalidIndex: 0,
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
        offense: Offense.PROPOSED_INCORRECT_ATTESTATIONS,
      },
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should emit WANT_TO_SLASH_EVENT for attestors when block built on invalid parent', async () => {
    // First, emit an invalid block using the pre-configured data
    const invalidBlockValidationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      block: publishedBlock,
      committee,
      epoch: 1n,
      seed: 0n,
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
    const publishedChildBlock = new PublishedL2Block(childBlock, { blockNumber: BigInt(2) } as any, []);
    const proposer2 = EthAddress.fromString('0x0000000000000000000000000000000000000def');

    epochCache.getProposerFromEpochCommittee.mockReturnValue(proposer2);

    const attestor1 = EthAddress.fromString('0x0000000000000000000000000000000000000111');
    const attestor2 = EthAddress.fromString('0x0000000000000000000000000000000000000222');

    const attestation1 = mock<BlockAttestation>();
    attestation1.getSender.mockReturnValue(attestor1);
    const attestation2 = mock<BlockAttestation>();
    attestation2.getSender.mockReturnValue(attestor2);

    const childValidationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      block: publishedChildBlock,
      committee: [proposer2, attestor1, attestor2],
      epoch: 1n,
      seed: 0n,
      attestations: [attestation1, attestation2],
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
        offense: Offense.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      },
    ]);

    expect(handler).toHaveBeenCalledWith([
      {
        validator: attestor1,
        amount: config.slashAttestDescendantOfInvalidPenalty,
        offense: Offense.ATTESTED_DESCENDANT_OF_INVALID,
      },
      {
        validator: attestor2,
        amount: config.slashAttestDescendantOfInvalidPenalty,
        offense: Offense.ATTESTED_DESCENDANT_OF_INVALID,
      },
    ]);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should return true for shouldSlash when validator has offended', async () => {
    const validationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      block: publishedBlock,
      committee,
      epoch: 1n,
      seed: 0n,
      attestations: [],
    };

    const event: InvalidBlockDetectedEvent = {
      type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
      validationResult,
    };

    l2BlockSource.emit(L2BlockSourceEvents.InvalidAttestationsBlockDetected, event);

    await sleep(100);

    // Should return true for the offending proposer
    await expect(
      watcher.shouldSlash({
        validator: proposer,
        amount: config.slashProposeInvalidAttestationsPenalty,
        offense: Offense.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      }),
    ).resolves.toBe(true);

    // Should return false for a different validator
    await expect(
      watcher.shouldSlash({
        validator: EthAddress.fromString('0x0000000000000000000000000000000000000000'),
        amount: config.slashProposeInvalidAttestationsPenalty,
        offense: Offense.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      }),
    ).resolves.toBe(false);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should return false for shouldSlash when amount exceeds max penalty', async () => {
    const validationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      block: publishedBlock,
      committee,
      epoch: 1n,
      seed: 0n,
      attestations: [],
    };

    const event: InvalidBlockDetectedEvent = {
      type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
      validationResult,
    };

    l2BlockSource.emit(L2BlockSourceEvents.InvalidAttestationsBlockDetected, event);

    await sleep(100);

    // Should return false when amount exceeds max penalty
    await expect(
      watcher.shouldSlash({
        validator: proposer,
        amount: config.slashProposeInvalidAttestationsMaxPenalty + 1n,
        offense: Offense.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      }),
    ).resolves.toBe(false);

    // Should return true when amount is within max penalty
    await expect(
      watcher.shouldSlash({
        validator: proposer,
        amount: config.slashProposeInvalidAttestationsMaxPenalty,
        offense: Offense.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      }),
    ).resolves.toBe(true);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not process the same invalid block twice', async () => {
    const validationResult: ValidateBlockNegativeResult = {
      valid: false,
      reason: 'insufficient-attestations',
      block: publishedBlock,
      committee,
      epoch: 1n,
      seed: 0n,
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
      block: publishedBlock,
      committee,
      epoch: 1n,
      seed: 0n,
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

  it('should return false for shouldSlash with unknown offense', async () => {
    const validator = EthAddress.fromString('0x0000000000000000000000000000000000000abc');

    await expect(
      watcher.shouldSlash({
        validator,
        amount: 1000n,
        offense: Offense.UNKNOWN,
      }),
    ).resolves.toBe(false);
  });
});

class MockL2BlockSource extends EventEmitter {
  constructor() {
    super();
  }
}
