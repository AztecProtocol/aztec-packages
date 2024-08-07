import { type BlockAttestation } from './block_attestation.js';
import { type BlockProposal } from './block_proposal.js';

/**
 * BlockWithAttestations
 * A data structure that contains a block proposal with it's attestations attached
 */
export class BlockWithAttestations {
  constructor(
    public readonly block: BlockProposal,
    /** Signatures of the attestations */
    public readonly attestations: Buffer[],
  ) {}

  static fromBlockAndBlockAttestations(block: BlockProposal, attestations: BlockAttestation[]): BlockWithAttestations {
    return new BlockWithAttestations(
      block,
      attestations.map(attestation => attestation.signature),
    );
  }
}
