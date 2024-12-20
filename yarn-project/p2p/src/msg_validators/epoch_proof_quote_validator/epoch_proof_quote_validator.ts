import { type EpochProofQuote, type P2PValidator, PeerErrorSeverity } from '@aztec/circuit-types';
import { type EpochCache } from '@aztec/epoch-cache';

export class EpochProofQuoteValidator implements P2PValidator<EpochProofQuote> {
  private epochCache: EpochCache;

  constructor(epochCache: EpochCache) {
    this.epochCache = epochCache;
  }

  validate(message: EpochProofQuote): Promise<PeerErrorSeverity | undefined> {
    const { epoch } = this.epochCache.getEpochAndSlotNow();

    // Check that the epoch proof quote is for the current epoch
    const epochToProve = message.payload.epochToProve;
    if (epochToProve !== epoch && epochToProve !== epoch - 1n) {
      return Promise.resolve(PeerErrorSeverity.HighToleranceError);
    }

    return Promise.resolve(undefined);
  }
}
