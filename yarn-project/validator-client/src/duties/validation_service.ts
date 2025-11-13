import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import type { Fr } from '@aztec/foundation/fields';
import type { CommitteeAttestationsAndSigners } from '@aztec/stdlib/block';
import {
  BlockAttestation,
  BlockProposal,
  type BlockProposalOptions,
  ConsensusPayload,
  SignatureDomainSeparator,
} from '@aztec/stdlib/p2p';
import type { ProposedBlockHeader, StateReference, Tx } from '@aztec/stdlib/tx';

import type { ValidatorKeyStore } from '../key_store/interface.js';

// Number of duplicate proposals to create for red-team testing
const DUPLICATE_PROPOSAL_COUNT = 4;

// Number of duplicate attestations to create per attestor
const DUPLICATE_ATTESTATION_COUNT = 2;

export class ValidationService {
  constructor(private keyStore: ValidatorKeyStore) {}

  /**
   * Create a block proposal with the given header, archive, and transactions
   *
   * @param header - The block header
   * @param archive - The archive of the current block
   * @param txs - TxHash[] ordered list of transactions
   *
   * @returns Array of block proposals (1 original + N duplicates with different signatures)
   */
  async createBlockProposal(
    header: ProposedBlockHeader,
    archive: Fr,
    stateReference: StateReference,
    txs: Tx[],
    proposerAttesterAddress: EthAddress | undefined,
    options: BlockProposalOptions,
  ): Promise<BlockProposal[]> {
    // Get the signer
    let signer;
    if (proposerAttesterAddress !== undefined) {
      signer = this.keyStore.getSignerForAddress(proposerAttesterAddress);
    } else {
      signer = this.keyStore.getSigner(0);
    }

    const payload = new ConsensusPayload(header, archive, stateReference);
    const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));

    // Create original proposal using standard deterministic signing
    const payloadHash = Buffer32.fromBuffer(
      keccak256(payload.getPayloadToSign(SignatureDomainSeparator.blockProposal)),
    );
    const originalSignature = signer.signMessage(payloadHash);
    const originalProposal = new BlockProposal(
      payload,
      originalSignature,
      txHashes,
      options.publishFullTxs ? txs : undefined,
    );

    // Create duplicates with non-deterministic signatures using indexed k values
    const duplicates: BlockProposal[] = [];
    for (let i = 0; i < DUPLICATE_PROPOSAL_COUNT; i++) {
      const customSignature = signer.signMessageWithCustomK(payloadHash, i);
      const duplicateProposal = new BlockProposal(
        payload,
        customSignature,
        txHashes,
        options.publishFullTxs ? txs : undefined,
      );
      duplicates.push(duplicateProposal);
    }

    // Return original + duplicates
    return [originalProposal, ...duplicates];
  }

  /**
   * Attest with selection of validators to the given block proposal, constructed by the current sequencer
   *
   * NOTE: This is just a blind signing.
   *       We assume that the proposal is valid and DA guarantees have been checked previously.
   *
   * @param proposal - The proposal to attest to
   * @param attestors - The validators to attest with
   * @returns attestations (including duplicates with different signatures for red-team testing)
   */
  async attestToProposal(proposal: BlockProposal, attestors: EthAddress[]): Promise<BlockAttestation[]> {
    const buf = Buffer32.fromBuffer(
      keccak256(proposal.payload.getPayloadToSign(SignatureDomainSeparator.blockAttestation)),
    );

    const allAttestations: BlockAttestation[] = [];

    // For each attestor, create original + duplicates
    for (const attestor of attestors) {
      const signer = this.keyStore.getSignerForAddress(attestor);

      // Create original attestation (deterministic)
      const originalSignature = await this.keyStore.signMessageWithAddress(attestor, buf);
      allAttestations.push(new BlockAttestation(proposal.payload, originalSignature, proposal.signature));

      // Create duplicate attestations (non-deterministic) using indexed k values
      for (let i = 0; i < DUPLICATE_ATTESTATION_COUNT; i++) {
        const customSignature = signer.signMessageWithCustomK(buf, i);
        allAttestations.push(new BlockAttestation(proposal.payload, customSignature, proposal.signature));
      }
    }

    return allAttestations;
  }

  async signAttestationsAndSigners(
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    proposer: EthAddress | undefined,
  ): Promise<Signature> {
    if (proposer === undefined) {
      return Signature.empty();
    }

    const buf = Buffer32.fromBuffer(
      keccak256(attestationsAndSigners.getPayloadToSign(SignatureDomainSeparator.attestationsAndSigners)),
    );
    return await this.keyStore.signMessageWithAddress(proposer, buf);
  }
}
