import type { EpochCacheInterface } from '@aztec/epoch-cache';
import type { CheckpointProposal, CoordinationSignatureContext } from '@aztec/stdlib/consensus';

import type { P2PValidator, ValidationResult } from '../../types/index.js';
import { ProposalValidator } from '../proposal_validator/proposal_validator.js';

export class CheckpointProposalValidator implements P2PValidator<CheckpointProposal> {
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
    this.proposalValidator = new ProposalValidator(epochCache, opts, 'p2p:checkpoint_proposal_validator');
  }

  async validate(proposal: CheckpointProposal): Promise<ValidationResult> {
    const headerResult = await this.proposalValidator.validate(proposal);
    if (headerResult.result !== 'accept') {
      return headerResult;
    }

    const blockProposal = proposal.getBlockProposal();
    if (blockProposal) {
      return this.proposalValidator.validateTxs(blockProposal);
    }

    return { result: 'accept' };
  }
}
