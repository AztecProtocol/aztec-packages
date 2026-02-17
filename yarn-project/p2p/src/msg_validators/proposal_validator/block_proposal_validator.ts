import type { EpochCacheInterface } from '@aztec/epoch-cache';
import type { BlockProposal, P2PValidator } from '@aztec/stdlib/p2p';

import { ProposalValidator } from '../proposal_validator/proposal_validator.js';

export class BlockProposalValidator extends ProposalValidator<BlockProposal> implements P2PValidator<BlockProposal> {
  constructor(epochCache: EpochCacheInterface, opts: { txsPermitted: boolean }) {
    super(epochCache, opts, 'p2p:block_proposal_validator');
  }
}
