import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256 } from '@aztec/foundation/crypto/keccak';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { createLogger } from '@aztec/foundation/log';
import type { CommitteeAttestationsAndSigners } from '@aztec/stdlib/block';
import type { CreateCheckpointProposalLastBlockData } from '@aztec/stdlib/interfaces/server';
import {
  BlockProposal,
  type BlockProposalOptions,
  CheckpointAttestation,
  CheckpointProposal,
  type CheckpointProposalCore,
  type CheckpointProposalOptions,
  ConsensusPayload,
  SignatureDomainSeparator,
} from '@aztec/stdlib/p2p';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { BlockHeader, Tx } from '@aztec/stdlib/tx';

import type { ValidatorKeyStore } from '../key_store/interface.js';

export class ValidationService {
  constructor(
    private keyStore: ValidatorKeyStore,
    private log = createLogger('validator:validation-service'),
  ) {}

  /**
   * Create a block proposal with the given header, archive, and transactions
   *
   * @param blockHeader - The block header
   * @param indexWithinCheckpoint - Index of this block within the checkpoint (0-indexed)
   * @param inHash - Hash of L1 to L2 messages for this checkpoint
   * @param archive - The archive of the current block
   * @param txs - TxHash[] ordered list of transactions
   * @param options - Block proposal options (including broadcastInvalidBlockProposal for testing)
   *
   * @returns A block proposal signing the above information
   */
  public createBlockProposal(
    blockHeader: BlockHeader,
    indexWithinCheckpoint: number,
    inHash: Fr,
    archive: Fr,
    txs: Tx[],
    proposerAttesterAddress: EthAddress | undefined,
    options: BlockProposalOptions,
  ): Promise<BlockProposal> {
    const payloadSigner = this.getPayloadSigner(proposerAttesterAddress);

    // For testing: change the new archive to trigger state_mismatch validation failure
    if (options.broadcastInvalidBlockProposal) {
      archive = Fr.random();
      this.log.warn(`Creating INVALID block proposal for slot ${blockHeader.globalVariables.slotNumber}`);
    }

    return BlockProposal.createProposalFromSigner(
      blockHeader,
      indexWithinCheckpoint,
      inHash,
      archive,
      txs.map(tx => tx.getTxHash()),
      options.publishFullTxs ? txs : undefined,
      payloadSigner,
    );
  }

  /**
   * Create a checkpoint proposal with the last block header and checkpoint header
   *
   * @param checkpointHeader - The checkpoint header containing aggregated data
   * @param archive - The archive of the checkpoint
   * @param lastBlockInfo - Info about the last block (header, index, txs) or undefined
   * @param proposerAttesterAddress - The address of the proposer
   * @param options - Checkpoint proposal options
   *
   * @returns A checkpoint proposal signing the above information
   */
  public createCheckpointProposal(
    checkpointHeader: CheckpointHeader,
    archive: Fr,
    lastBlockInfo: CreateCheckpointProposalLastBlockData | undefined,
    proposerAttesterAddress: EthAddress | undefined,
    options: CheckpointProposalOptions,
  ): Promise<CheckpointProposal> {
    const payloadSigner = this.getPayloadSigner(proposerAttesterAddress);

    // For testing: change the archive to trigger state_mismatch validation failure
    if (options.broadcastInvalidCheckpointProposal) {
      archive = Fr.random();
      this.log.warn(`Creating INVALID checkpoint proposal for slot ${checkpointHeader.slotNumber}`);
    }

    // Last block to include in the proposal
    const lastBlock = lastBlockInfo && {
      blockHeader: lastBlockInfo.blockHeader,
      indexWithinCheckpoint: lastBlockInfo.indexWithinCheckpoint,
      txHashes: lastBlockInfo.txs.map(tx => tx.getTxHash()),
      txs: options.publishFullTxs ? lastBlockInfo.txs : undefined,
    };

    return CheckpointProposal.createProposalFromSigner(checkpointHeader, archive, lastBlock, payloadSigner);
  }

  private getPayloadSigner(proposerAttesterAddress: EthAddress | undefined): (payload: Buffer32) => Promise<Signature> {
    if (proposerAttesterAddress !== undefined) {
      return (payload: Buffer32) => this.keyStore.signMessageWithAddress(proposerAttesterAddress, payload);
    } else {
      // if there is no proposer attester address, just use the first signer
      const signer = this.keyStore.getAddress(0);
      return (payload: Buffer32) => this.keyStore.signMessageWithAddress(signer, payload);
    }
  }

  /**
   * Attest with selection of validators to the given checkpoint proposal
   *
   * NOTE: This is just a blind signing.
   *       We assume that the proposal is valid and DA guarantees have been checked previously.
   *
   * @param proposal - The checkpoint proposal (core version without lastBlock) to attest to
   * @param attestors - The validators to attest with
   * @returns checkpoint attestations
   */
  async attestToCheckpointProposal(
    proposal: CheckpointProposalCore,
    attestors: EthAddress[],
  ): Promise<CheckpointAttestation[]> {
    // Create the attestation payload from the checkpoint proposal
    const payload = new ConsensusPayload(proposal.checkpointHeader, proposal.archive);
    const buf = Buffer32.fromBuffer(
      keccak256(payload.getPayloadToSign(SignatureDomainSeparator.checkpointAttestation)),
    );
    const signatures = await Promise.all(
      attestors.map(attestor => this.keyStore.signMessageWithAddress(attestor, buf)),
    );
    return signatures.map(sig => new CheckpointAttestation(payload, sig, proposal.signature));
  }

  async signAttestationsAndSigners(
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    proposer: EthAddress,
  ): Promise<Signature> {
    const buf = Buffer32.fromBuffer(
      keccak256(attestationsAndSigners.getPayloadToSign(SignatureDomainSeparator.attestationsAndSigners)),
    );
    return await this.keyStore.signMessageWithAddress(proposer, buf);
  }
}
