import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import type { Logger } from '@aztec/foundation/log';
import { BlockProposal, CheckpointProposal, PeerErrorSeverity } from '@aztec/stdlib/p2p';

export abstract class ProposalValidator<TProposal extends BlockProposal | CheckpointProposal> {
  protected epochCache: EpochCacheInterface;
  protected logger: Logger;
  protected txsPermitted: boolean;

  constructor(epochCache: EpochCacheInterface, opts: { txsPermitted: boolean }, logger: Logger) {
    this.epochCache = epochCache;
    this.txsPermitted = opts.txsPermitted;
    this.logger = logger;
  }

  public async validate(proposal: TProposal): Promise<PeerErrorSeverity | undefined> {
    try {
      // Slot check
      const { currentSlot, nextSlot } = this.epochCache.getCurrentAndNextSlot();
      const slotNumber = proposal.slotNumber;
      if (slotNumber !== currentSlot && slotNumber !== nextSlot) {
        this.logger.debug(`Penalizing peer for invalid slot number ${slotNumber}`, { currentSlot, nextSlot });
        return PeerErrorSeverity.HighToleranceError;
      }

      // Signature validity
      const proposer = proposal.getSender();
      if (!proposer) {
        this.logger.debug(`Penalizing peer for proposal with invalid signature`);
        return PeerErrorSeverity.MidToleranceError;
      }

      // Transactions permitted check
      const embeddedTxCount = proposal.txs?.length ?? 0;
      if (!this.txsPermitted && (proposal.txHashes.length > 0 || embeddedTxCount > 0)) {
        this.logger.debug(
          `Penalizing peer for proposal with ${proposal.txHashes.length} transaction(s) when transactions are not permitted`,
        );
        return PeerErrorSeverity.MidToleranceError;
      }

      // Embedded txs must be listed in txHashes
      const hashSet = new Set(proposal.txHashes.map(h => h.toString()));
      const missingTxHashes =
        embeddedTxCount > 0
          ? proposal.txs!.filter(tx => !hashSet.has(tx.getTxHash().toString())).map(tx => tx.getTxHash().toString())
          : [];
      if (embeddedTxCount > 0 && missingTxHashes.length > 0) {
        this.logger.warn('Penalizing peer for embedded transaction(s) not included in txHashes', {
          embeddedTxCount,
          txHashesLength: proposal.txHashes.length,
          missingTxHashes,
        });
        return PeerErrorSeverity.MidToleranceError;
      }

      // Proposer check
      const expectedProposer = await this.epochCache.getProposerAttesterAddressInSlot(slotNumber);
      if (expectedProposer !== undefined && !proposer.equals(expectedProposer)) {
        this.logger.debug(`Penalizing peer for invalid proposer for current slot ${slotNumber}`, {
          expectedProposer,
          proposer: proposer.toString(),
        });
        return PeerErrorSeverity.MidToleranceError;
      }

      // Validate tx hashes for all txs embedded in the proposal
      if (!(await Promise.all(proposal.txs?.map(tx => tx.validateTxHash()) ?? [])).every(v => v)) {
        this.logger.warn(`Penalizing peer for invalid tx hashes in proposal`, {
          proposer,
          slotNumber,
        });
        return PeerErrorSeverity.LowToleranceError;
      }

      return undefined;
    } catch (e) {
      if (e instanceof NoCommitteeError) {
        return PeerErrorSeverity.LowToleranceError;
      }
      throw e;
    }
  }
}
