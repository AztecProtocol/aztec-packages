import type { EpochCacheInterface } from '@aztec/epoch-cache';
import type { BlockProposal, CoordinationSignatureContext, P2PValidator } from '@aztec/stdlib/p2p';
import type { ConsensusTimetable } from '@aztec/stdlib/timetable';

import { type ProposalValidationResult, ProposalValidator } from '../proposal_validator/proposal_validator.js';

export class BlockProposalValidator implements P2PValidator<BlockProposal> {
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
    this.proposalValidator = new ProposalValidator(epochCache, timetable, opts, 'p2p:block_proposal_validator');
  }

  async validate(proposal: BlockProposal): Promise<ProposalValidationResult> {
    const headerResult = await this.proposalValidator.validate(proposal);
    if (headerResult.result !== 'accept') {
      return headerResult;
    }
    return this.proposalValidator.validateTxs(proposal);
  }

  /**
   * Runs every check `validate` runs except whether the proposal arrived inside its receive window. Intended
   * for callers that already accepted this exact proposal on arrival and are re-checking it later: the
   * receive-window check depends on the wall clock at evaluation time, so repeating it would fail an on-time
   * proposal purely because processing started late. Every other check, including the full transaction-field
   * validation, is a property of the signed payload and still applies.
   */
  async validateStableFields(proposal: BlockProposal): Promise<ProposalValidationResult> {
    const headerResult = await this.proposalValidator.validateStableFields(proposal);
    if (headerResult.result !== 'accept') {
      return headerResult;
    }
    return this.proposalValidator.validateTxs(proposal);
  }
}
