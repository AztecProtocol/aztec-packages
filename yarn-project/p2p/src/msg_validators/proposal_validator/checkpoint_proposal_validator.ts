import type { EpochCacheInterface } from '@aztec/epoch-cache';
import type { CheckpointProposal, P2PValidator } from '@aztec/stdlib/p2p';

import { ProposalValidator } from '../proposal_validator/proposal_validator.js';

export class CheckpointProposalValidator
  extends ProposalValidator<CheckpointProposal>
  implements P2PValidator<CheckpointProposal>
{
  constructor(epochCache: EpochCacheInterface, opts: { txsPermitted: boolean }) {
    super(epochCache, opts, 'p2p:checkpoint_proposal_validator');
  }
}
