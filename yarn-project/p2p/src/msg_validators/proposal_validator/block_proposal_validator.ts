import type { EpochCacheInterface } from '@aztec/epoch-cache';
import type { BlockProposal, CoordinationSignatureContext, P2PValidator, ValidationResult } from '@aztec/stdlib/p2p';

import { ProposalValidator } from '../proposal_validator/proposal_validator.js';

export class BlockProposalValidator implements P2PValidator<BlockProposal> {
  private proposalValidator: ProposalValidator;

  constructor(
    epochCache: EpochCacheInterface,
    opts: {
      txsPermitted: boolean;
      maxTxsPerBlock?: number;
      maxBlocksPerCheckpoint?: number;
      p2pPropagationTime?: number;
      skipSlotValidation?: boolean;
      signatureContext: CoordinationSignatureContext;
    },
  ) {
    this.proposalValidator = new ProposalValidator(epochCache, opts, 'p2p:block_proposal_validator');
  }

  async validate(proposal: BlockProposal): Promise<ValidationResult> {
    const headerResult = await this.proposalValidator.validate(proposal);
    if (headerResult.result !== 'accept') {
      return headerResult;
    }
    return this.proposalValidator.validateTxs(proposal);
  }
}
