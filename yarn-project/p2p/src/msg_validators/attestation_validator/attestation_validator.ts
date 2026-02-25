import type { EpochCacheInterface, EpochCacheView } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  type CheckpointAttestation,
  type P2PValidator,
  PeerErrorSeverity,
  type ValidationResult,
} from '@aztec/stdlib/p2p';

import { isWithinClockTolerance } from '../clock_tolerance.js';

export class CheckpointAttestationValidator implements P2PValidator<CheckpointAttestation> {
  protected epochCache: EpochCacheInterface;

  // TODO(md): thinking, should these really be the other way around? everything works on slots at this point in time, so this should be fine
  protected proposerView: EpochCacheView;
  protected logger: Logger;

  constructor(epochCache: EpochCacheInterface) {
    this.epochCache = epochCache;
    const viewFactory = epochCache.getViewFactory();
    this.proposerView = viewFactory.withProposerView();
    this.logger = createLogger('p2p:checkpoint-attestation-validator');
  }

  async validate(message: CheckpointAttestation): Promise<ValidationResult> {
    const slotNumber = message.payload.header.slotNumber;

    try {
      // TODO(md): This really depends on the time in which we made the checkpoint
      //           if the last checkpoint proposal was received at the end of one slot
      //           we should really have enough time to verify it here
      const { currentSlot, nextSlot } = this.proposerView.getCurrentAndNextSlot();

      if (slotNumber !== currentSlot && slotNumber !== nextSlot) {
        // Check if message is for previous slot and within clock tolerance
        if (!isWithinClockTolerance(slotNumber, currentSlot, this.proposerView)) {
          this.logger.warn(
            `Checkpoint attestation slot ${slotNumber} is not current (${currentSlot}) or next (${nextSlot}) slot`,
          );
          return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
        }
        this.logger.debug(`Ignoring checkpoint attestation for previous slot ${slotNumber} within clock tolerance`);
        return { result: 'ignore' };
      }

      // Verify the signature is valid
      const attester = message.getSender();
      if (attester === undefined) {
        this.logger.warn(`Invalid signature in checkpoint attestation for slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError };
      }

      // Verify the attester is in the committee for this slot
      if (!(await this.epochCache.isInCommittee(slotNumber, attester))) {
        this.logger.warn(`Attester ${attester.toString()} is not in committee for slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
      }

      // Verify the proposer signature matches the expected proposer for the attestation's slot
      // We look up the proposer for the specific slot rather than using currentSlot/nextSlot
      // since timing differences could cause mismatches
      const proposer = message.getProposer();
      const expectedProposer = await this.epochCache.getProposerAttesterAddressInSlot(slotNumber);
      if (!expectedProposer) {
        this.logger.warn(`No proposer defined for slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
      }
      if (!proposer) {
        this.logger.warn(`Invalid proposer signature in checkpoint attestation for slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError };
      }
      if (!proposer.equals(expectedProposer)) {
        this.logger.warn(
          `Proposer signature mismatch in checkpoint attestation. ` +
            `Expected ${expectedProposer?.toString() ?? 'none'} but got ${proposer.toString()} for slot ${slotNumber}`,
        );
        return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
      }

      return { result: 'accept' };
    } catch (e) {
      // People shouldn't be sending us attestations if the committee doesn't exist
      if (e instanceof NoCommitteeError) {
        this.logger.warn(`No committee exists for checkpoint attestation for slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError };
      }
      throw e;
    }
  }
}
