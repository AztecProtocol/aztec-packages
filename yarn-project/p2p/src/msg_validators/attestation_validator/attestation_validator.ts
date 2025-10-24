import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type BlockAttestation, type P2PValidator, PeerErrorSeverity } from '@aztec/stdlib/p2p';

export class AttestationValidator implements P2PValidator<BlockAttestation> {
  private epochCache: EpochCacheInterface;
  private logger: Logger;

  constructor(epochCache: EpochCacheInterface) {
    this.epochCache = epochCache;
    this.logger = createLogger('p2p:attestation-validator');
  }

  async validate(message: BlockAttestation): Promise<PeerErrorSeverity | undefined> {
    const slotNumberBigInt = message.payload.header.slotNumber.toBigInt();

    try {
      const { currentProposer, nextProposer, currentSlot, nextSlot } =
        await this.epochCache.getProposerAttesterAddressInCurrentOrNextSlot();

      if (slotNumberBigInt !== currentSlot && slotNumberBigInt !== nextSlot) {
        this.logger.warn(
          `Attestation slot ${slotNumberBigInt} is not current (${currentSlot}) or next (${nextSlot}) slot`,
        );
        return PeerErrorSeverity.HighToleranceError;
      }

      // Verify the signature is valid
      const attester = message.getSender();
      if (attester === undefined) {
        this.logger.warn(`Invalid signature in attestation for slot ${slotNumberBigInt}`);
        return PeerErrorSeverity.LowToleranceError;
      }

      // Verify the attester is in the committee for this slot
      if (!(await this.epochCache.isInCommittee(slotNumberBigInt, attester))) {
        this.logger.warn(`Attester ${attester.toString()} is not in committee for slot ${slotNumberBigInt}`);
        return PeerErrorSeverity.HighToleranceError;
      }

      // Verify the proposer signature matches the expected proposer for this slot
      const proposer = message.getProposer();
      const expectedProposer = slotNumberBigInt === currentSlot ? currentProposer : nextProposer;
      if (!expectedProposer) {
        this.logger.warn(`No proposer defined for slot ${slotNumberBigInt}`);
        return PeerErrorSeverity.HighToleranceError;
      }
      if (!proposer.equals(expectedProposer)) {
        this.logger.warn(
          `Proposer signature mismatch in attestation. ` +
            `Expected ${expectedProposer?.toString() ?? 'none'} but got ${proposer.toString()} for slot ${slotNumberBigInt}`,
        );
        return PeerErrorSeverity.HighToleranceError;
      }

      return undefined;
    } catch (e) {
      // People shouldn't be sending us attestations if the committee doesn't exist
      if (e instanceof NoCommitteeError) {
        this.logger.warn(`No committee exists for attestation for slot ${slotNumberBigInt}`);
        return PeerErrorSeverity.LowToleranceError;
      }
      throw e;
    }
  }
}
