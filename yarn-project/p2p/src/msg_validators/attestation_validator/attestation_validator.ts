import type { EpochCacheInterface } from '@aztec/epoch-cache';
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
  protected logger: Logger;

  constructor(epochCache: EpochCacheInterface) {
    this.epochCache = epochCache;
    this.logger = createLogger('p2p:checkpoint-attestation-validator');
  }

  async validate(message: CheckpointAttestation): Promise<ValidationResult> {
    const slotNumber = message.payload.header.slotNumber;

    try {
      const { currentSlot, nextSlot } = this.epochCache.getCurrentAndNextSlot();

      if (slotNumber !== currentSlot && slotNumber !== nextSlot) {
        // Check if message is for previous slot and within clock tolerance
        if (!isWithinClockTolerance(slotNumber, currentSlot, this.epochCache)) {
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
