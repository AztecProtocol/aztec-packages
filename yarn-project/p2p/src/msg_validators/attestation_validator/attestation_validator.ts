import { type BlockAttestation, type P2PValidator, PeerErrorSeverity } from '@aztec/circuit-types';
import { type EpochCache } from '@aztec/epoch-cache';

export class AttestationValidator implements P2PValidator<BlockAttestation> {
  private epochCache: EpochCache;

  constructor(epochCache: EpochCache) {
    this.epochCache = epochCache;
  }

  async validate(message: BlockAttestation): Promise<PeerErrorSeverity | undefined> {
    const { currentSlot, nextSlot } = await this.epochCache.getProposerInCurrentOrNextSlot();

    const slotNumberBigInt = message.payload.header.globalVariables.slotNumber.toBigInt();
    if (slotNumberBigInt !== currentSlot && slotNumberBigInt !== nextSlot) {
      return PeerErrorSeverity.HighToleranceError;
    }

    const attester = message.getSender();
    if (!(await this.epochCache.isInCommittee(attester))) {
      return PeerErrorSeverity.HighToleranceError;
    }

    return undefined;
  }
}
