import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import type { Logger } from '@aztec/foundation/log';
import { type CheckpointAttestation, type P2PValidator, PeerErrorSeverity } from '@aztec/stdlib/p2p';

export class CheckpointAttestationValidator implements P2PValidator<CheckpointAttestation> {
  protected epochCache: EpochCacheInterface;
  protected logger: Logger;

  constructor(epochCache: EpochCacheInterface, logger: Logger) {
    this.epochCache = epochCache;
    this.logger = logger;
  }

  async validate(message: CheckpointAttestation): Promise<PeerErrorSeverity | undefined> {
    const slotNumber = message.payload.header.slotNumber;

    try {
      const { currentSlot, nextSlot } = this.epochCache.getCurrentAndNextSlot();

      if (slotNumber !== currentSlot && slotNumber !== nextSlot) {
        this.logger.warn(
          `Checkpoint attestation slot ${slotNumber} is not current (${currentSlot}) or next (${nextSlot}) slot`,
        );
        return PeerErrorSeverity.HighToleranceError;
      }

      // Verify the signature is valid
      const attester = message.getSender();
      if (attester === undefined) {
        this.logger.warn(`Invalid signature in checkpoint attestation for slot ${slotNumber}`);
        return PeerErrorSeverity.LowToleranceError;
      }

      // Verify the attester is in the committee for this slot
      if (!(await this.epochCache.isInCommittee(slotNumber, attester))) {
        this.logger.warn(`Attester ${attester.toString()} is not in committee for slot ${slotNumber}`);
        return PeerErrorSeverity.HighToleranceError;
      }

      // Verify the proposer signature matches the expected proposer for the attestation's slot
      // We look up the proposer for the specific slot rather than using currentSlot/nextSlot
      // since timing differences could cause mismatches
      const proposer = message.getProposer();
      const expectedProposer = await this.epochCache.getProposerAttesterAddressInSlot(slotNumber);
      if (!expectedProposer) {
        this.logger.warn(`No proposer defined for slot ${slotNumber}`);
        return PeerErrorSeverity.HighToleranceError;
      }
      if (!proposer) {
        this.logger.warn(`Invalid proposer signature in checkpoint attestation for slot ${slotNumber}`);
        return PeerErrorSeverity.LowToleranceError;
      }
      if (!proposer.equals(expectedProposer)) {
        this.logger.warn(
          `Proposer signature mismatch in checkpoint attestation. ` +
            `Expected ${expectedProposer?.toString() ?? 'none'} but got ${proposer.toString()} for slot ${slotNumber}`,
        );
        return PeerErrorSeverity.HighToleranceError;
      }

      return undefined;
    } catch (e) {
      // People shouldn't be sending us attestations if the committee doesn't exist
      if (e instanceof NoCommitteeError) {
        this.logger.warn(`No committee exists for checkpoint attestation for slot ${slotNumber}`);
        return PeerErrorSeverity.LowToleranceError;
      }
      throw e;
    }
  }
}
