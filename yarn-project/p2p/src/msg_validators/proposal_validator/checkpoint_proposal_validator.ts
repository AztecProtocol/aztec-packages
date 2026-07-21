import type { EpochCacheInterface } from '@aztec/epoch-cache';
import type {
  CheckpointProposal,
  CoordinationSignatureContext,
  P2PValidator,
  ValidationResult,
} from '@aztec/stdlib/p2p';
import type { ConsensusTimetable } from '@aztec/stdlib/timetable';

import { ProposalValidator } from '../proposal_validator/proposal_validator.js';

export class CheckpointProposalValidator implements P2PValidator<CheckpointProposal> {
  private proposalValidator: ProposalValidator;

  constructor(
    epochCache: EpochCacheInterface,
    timetable: ConsensusTimetable,
    opts: {
      txsPermitted: boolean;
      maxTxsPerBlock?: number;
      maxBlocksPerCheckpoint?: number;
      skipSlotValidation?: boolean;
      signatureContext: CoordinationSignatureContext;
      clockDisparityMs: number;
    },
  ) {
    this.proposalValidator = new ProposalValidator(epochCache, timetable, opts, 'p2p:checkpoint_proposal_validator');
  }

  async validate(proposal: CheckpointProposal): Promise<ValidationResult> {
    const headerResult = await this.proposalValidator.validate(proposal);
    if (headerResult.result !== 'accept') {
      return headerResult;
    }

    const blockProposal = proposal.getBlockProposal();
    if (blockProposal) {
      // The terminal block is carried inside the checkpoint proposal rather than gossiped as a
      // standalone block proposal, so apply the per-checkpoint block ceiling to it here too.
      const indexResult = this.proposalValidator.validateBlockIndexWithinCheckpoint(blockProposal);
      if (indexResult.result !== 'accept') {
        return indexResult;
      }
      return this.proposalValidator.validateTxs(blockProposal);
    }

    return { result: 'accept' };
  }
}
