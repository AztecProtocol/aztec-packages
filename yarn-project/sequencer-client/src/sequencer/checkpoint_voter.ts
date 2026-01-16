import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import type { SlasherClientInterface } from '@aztec/slasher';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import type { ResolvedSequencerConfig } from '@aztec/stdlib/interfaces/server';
import type { ValidatorClient } from '@aztec/validator-client';

import type { TypedDataDefinition } from 'viem';

import type { SequencerPublisher } from '../publisher/sequencer-publisher.js';
import type { SequencerMetrics } from './metrics.js';
import type { SequencerRollupConstants } from './types.js';

/**
 * Handles governance and slashing voting for a given slot.
 */
export class CheckpointVoter {
  private slotTimestamp: bigint;
  private signer: (msg: TypedDataDefinition) => Promise<`0x${string}`>;

  constructor(
    private readonly slot: SlotNumber,
    private readonly publisher: SequencerPublisher,
    private readonly attestorAddress: EthAddress,
    private readonly validatorClient: ValidatorClient,
    private readonly slasherClient: SlasherClientInterface | undefined,
    private readonly l1Constants: SequencerRollupConstants,
    private readonly config: ResolvedSequencerConfig,
    private readonly metrics: SequencerMetrics,
    private readonly log: Logger,
  ) {
    this.slotTimestamp = getTimestampForSlot(this.slot, this.l1Constants);
    this.signer = (msg: TypedDataDefinition) =>
      this.validatorClient.signWithAddress(this.attestorAddress, msg).then(s => s.toString());
  }

  /**
   * Enqueues governance and slashing votes with the publisher.
   * Returns a tuple of promises that resolve to whether each vote was successfully enqueued.
   */
  enqueueVotes(): [Promise<boolean | undefined>, Promise<boolean | undefined>] {
    try {
      const enqueueGovernancePromise = this.enqueueGovernanceVote();
      const enqueueSlashingPromise = this.enqueueSlashingVote();

      return [enqueueGovernancePromise, enqueueSlashingPromise];
    } catch (err) {
      this.log.error(`Error enqueueing governance and slashing votes`, err);
      return [Promise.resolve(false), Promise.resolve(false)];
    }
  }

  private async enqueueGovernanceVote(): Promise<boolean | undefined> {
    const governanceProposerPayload = this.config.governanceProposerPayload;
    if (!governanceProposerPayload || governanceProposerPayload.isZero()) {
      return undefined;
    }

    this.log.info(`Enqueuing vote for ${governanceProposerPayload} governance for slot ${this.slot}`, {
      slot: this.slot,
      governanceProposerPayload: governanceProposerPayload.toString(),
    });

    try {
      return await this.publisher.enqueueGovernanceCastSignal(
        governanceProposerPayload,
        this.slot,
        this.slotTimestamp,
        this.attestorAddress,
        this.signer,
      );
    } catch (err) {
      this.log.error(`Error enqueuing governance vote`, err, { slot: this.slot });
      return false;
    }
  }

  private async enqueueSlashingVote(): Promise<boolean | undefined> {
    try {
      const actions = await this.slasherClient?.getProposerActions(this.slot);
      if (!actions || actions.length === 0) {
        return undefined;
      }

      this.log.info(`Enqueuing vote for ${actions.length} slashing actions for slot ${this.slot}`, {
        slot: this.slot,
        actionCount: actions.length,
      });

      this.metrics.recordSlashingAttempt(actions.length);

      return await this.publisher.enqueueSlashingActions(
        actions,
        this.slot,
        this.slotTimestamp,
        this.attestorAddress,
        this.signer,
      );
    } catch (err) {
      this.log.error(`Error enqueuing slashing vote`, err, { slot: this.slot });
      return false;
    }
  }
}
