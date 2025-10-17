import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type BlockProposal, type P2PValidator, PeerErrorSeverity } from '@aztec/stdlib/p2p';

export class BlockProposalValidator implements P2PValidator<BlockProposal> {
  private epochCache: EpochCacheInterface;
  private logger: Logger;

  constructor(epochCache: EpochCacheInterface) {
    this.epochCache = epochCache;
    this.logger = createLogger('p2p:block_proposal_validator');
  }

  async validate(block: BlockProposal): Promise<PeerErrorSeverity | undefined> {
    try {
      // Check signature validity first - invalid signatures are a high-severity issue
      const proposer = block.getSender();
      if (!proposer) {
        this.logger.debug(`Penalizing peer for block proposal with invalid signature`);
        return PeerErrorSeverity.MidToleranceError;
      }

      const { currentProposer, nextProposer, currentSlot, nextSlot } =
        await this.epochCache.getProposerAttesterAddressInCurrentOrNextSlot();

      // Check that the attestation is for the current or next slot
      const slotNumberBigInt = block.payload.header.slotNumber.toBigInt();
      if (slotNumberBigInt !== currentSlot && slotNumberBigInt !== nextSlot) {
        this.logger.debug(`Penalizing peer for invalid slot number ${slotNumberBigInt}`, { currentSlot, nextSlot });
        return PeerErrorSeverity.HighToleranceError;
      }

      // Check that the block proposal is from the current or next proposer
      if (slotNumberBigInt === currentSlot && currentProposer !== undefined && !proposer.equals(currentProposer)) {
        this.logger.debug(`Penalizing peer for invalid proposer for current slot ${slotNumberBigInt}`, {
          currentProposer,
          nextProposer,
          proposer: proposer.toString(),
        });
        return PeerErrorSeverity.MidToleranceError;
      }

      if (slotNumberBigInt === nextSlot && nextProposer !== undefined && !proposer.equals(nextProposer)) {
        this.logger.debug(`Penalizing peer for invalid proposer for next slot ${slotNumberBigInt}`, {
          currentProposer,
          nextProposer,
          proposer: proposer.toString(),
        });
        return PeerErrorSeverity.MidToleranceError;
      }

      return undefined;
    } catch (e) {
      // People shouldn't be sending us block proposals if the committee doesn't exist
      if (e instanceof NoCommitteeError) {
        return PeerErrorSeverity.LowToleranceError;
      }
      throw e;
    }
  }
}
