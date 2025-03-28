import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { type BlockProposal, type P2PValidator, PeerErrorSeverity } from '@aztec/stdlib/p2p';

export class BlockProposalValidator implements P2PValidator<BlockProposal> {
  private epochCache: EpochCacheInterface;

  constructor(epochCache: EpochCacheInterface) {
    this.epochCache = epochCache;
  }

  async validate(block: BlockProposal): Promise<PeerErrorSeverity | undefined> {
    const { currentProposer, nextProposer, currentSlot, nextSlot } =
      await this.epochCache.getProposerInCurrentOrNextSlot();

    // Check that the attestation is for the current or next slot
    const slotNumberBigInt = block.payload.header.globalVariables.slotNumber.toBigInt();
    if (slotNumberBigInt !== currentSlot && slotNumberBigInt !== nextSlot) {
      return PeerErrorSeverity.HighToleranceError;
    }

    // Check that the block proposal is from the current or next proposer
    const proposer = await block.getSender();
    if (!proposer.equals(currentProposer) && !proposer.equals(nextProposer)) {
      return PeerErrorSeverity.HighToleranceError;
    }

    return undefined;
  }
}
