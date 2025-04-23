import type { EpochCacheInterface } from '@aztec/epoch-cache';
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
    const { currentProposer, nextProposer, currentSlot, nextSlot } =
      await this.epochCache.getProposerInCurrentOrNextSlot();

    // Check that the attestation is for the current or next slot
    const slotNumberBigInt = block.payload.header.slotNumber.toBigInt();
    if (slotNumberBigInt !== currentSlot && slotNumberBigInt !== nextSlot) {
      this.logger.debug(
        `Penalizing peer for invalid slot number ${slotNumberBigInt}, current slot: ${currentSlot}, next slot: ${nextSlot}`,
      );
      return PeerErrorSeverity.HighToleranceError;
    }

    // Check that the block proposal is from the current or next proposer
    const proposer = block.getSender();
    if (!proposer.equals(currentProposer) && !proposer.equals(nextProposer)) {
      this.logger.debug(
        `Penalizing peer for invalid proposer ${proposer.toString()}, current proposer: ${currentProposer.toString()}, next proposer: ${nextProposer.toString()}`,
      );
      return PeerErrorSeverity.HighToleranceError;
    }

    return undefined;
  }
}
