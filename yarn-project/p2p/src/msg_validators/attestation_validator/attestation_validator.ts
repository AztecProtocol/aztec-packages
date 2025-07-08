import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum';
import { type BlockAttestation, type P2PValidator, PeerErrorSeverity } from '@aztec/stdlib/p2p';

export class AttestationValidator implements P2PValidator<BlockAttestation> {
  private epochCache: EpochCacheInterface;

  constructor(epochCache: EpochCacheInterface) {
    this.epochCache = epochCache;
  }

  async validate(message: BlockAttestation): Promise<PeerErrorSeverity | undefined> {
    try {
      const { currentSlot, nextSlot } = await this.epochCache.getProposerAttesterAddressInCurrentOrNextSlot();

      const slotNumberBigInt = message.payload.header.slotNumber.toBigInt();
      if (slotNumberBigInt !== currentSlot && slotNumberBigInt !== nextSlot) {
        return PeerErrorSeverity.HighToleranceError;
      }

      const attester = message.getSender();
      if (!(await this.epochCache.isInCommittee(slotNumberBigInt, attester))) {
        return PeerErrorSeverity.HighToleranceError;
      }
      return undefined;
    } catch (e) {
      // People shouldn't be sending us attestations if the committee doesn't exist
      if (e instanceof NoCommitteeError) {
        return PeerErrorSeverity.LowToleranceError;
      }
      throw e;
    }
  }
}
