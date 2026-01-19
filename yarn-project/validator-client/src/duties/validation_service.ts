import { BlockNumber, type CheckpointNumber, type SlotNumber } from '@aztec/foundation/branded-types';
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
import { DutyAlreadySignedError, SlashingProtectionError } from '@aztec/validator-ha-signer/errors';
import { DutyType, type SigningContext } from '@aztec/validator-ha-signer/types';

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
   * @param blockIndexWithinCheckpoint - The block index within checkpoint for HA signing context
   * @param inHash - Hash of L1 to L2 messages for this checkpoint
   * @param archive - The archive of the current block
   * @param txs - Ordered list of transactions (Tx[])
   * @param proposerAttesterAddress - The address of the proposer/attester, or undefined
   * @param options - Block proposal options (including broadcastInvalidBlockProposal for testing)
   *
   * @returns A block proposal signing the above information
   * @throws DutyAlreadySignedError if HA signer indicates duty already signed by another node
   * @throws SlashingProtectionError if attempting to sign different data for same slot
   */
  public createBlockProposal(
    blockHeader: BlockHeader,
    blockIndexWithinCheckpoint: number,
    inHash: Fr,
    archive: Fr,
    txs: Tx[],
    proposerAttesterAddress: EthAddress | undefined,
    options: BlockProposalOptions,
  ): Promise<BlockProposal> {
    // For testing: change the new archive to trigger state_mismatch validation failure
    if (options.broadcastInvalidBlockProposal) {
      archive = Fr.random();
      this.log.warn(`Creating INVALID block proposal for slot ${blockHeader.globalVariables.slotNumber}`);
    }

    // Create a signer that uses the appropriate address
    const address = proposerAttesterAddress ?? this.keyStore.getAddress(0);
    const payloadSigner = (payload: Buffer32, context: SigningContext) =>
      this.keyStore.signMessageWithAddress(address, payload, context);

    return BlockProposal.createProposalFromSigner(
      blockHeader,
      blockIndexWithinCheckpoint,
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
    // For testing: change the archive to trigger state_mismatch validation failure
    if (options.broadcastInvalidCheckpointProposal) {
      archive = Fr.random();
      this.log.warn(`Creating INVALID checkpoint proposal for slot ${checkpointHeader.slotNumber}`);
    }

    // Create a signer that takes payload and context, and uses the appropriate address
    const payloadSigner = (payload: Buffer32, context: SigningContext) => {
      const address = proposerAttesterAddress ?? this.keyStore.getAddress(0);
      return this.keyStore.signMessageWithAddress(address, payload, context);
    };

    // Last block to include in the proposal
    const lastBlock = lastBlockInfo && {
      blockHeader: lastBlockInfo.blockHeader,
      indexWithinCheckpoint: lastBlockInfo.indexWithinCheckpoint,
      txHashes: lastBlockInfo.txs.map(tx => tx.getTxHash()),
      txs: options.publishFullTxs ? lastBlockInfo.txs : undefined,
    };

    return CheckpointProposal.createProposalFromSigner(checkpointHeader, archive, lastBlock, payloadSigner);
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

    // TODO(spy/ha): Use checkpointNumber instead of blockNumber once CheckpointHeader includes it.
    // Currently using lastBlock.blockNumber as a proxy for checkpoint identification in HA signing.
    // blockNumber is NOT used for the primary key so it's safe to use here.
    // See CheckpointHeader TODO and SigningContext types documentation.
    let blockNumber: BlockNumber;
    try {
      blockNumber = proposal.blockNumber;
    } catch {
      // Checkpoint proposal may not have lastBlock, use 0 as fallback
      blockNumber = BlockNumber(0);
    }
    const context: SigningContext = {
      slot: proposal.slotNumber,
      blockNumber,
      dutyType: DutyType.ATTESTATION,
    };

    // Sign each attestor in parallel, catching HA errors per-attestor
    const results = await Promise.allSettled(
      attestors.map(async attestor => {
        const sig = await this.keyStore.signMessageWithAddress(attestor, buf, context);
        // return new BlockAttestation(proposal.payload, sig, proposal.signature);
        return new CheckpointAttestation(payload, sig, proposal.signature);
      }),
    );

    const attestations: CheckpointAttestation[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        attestations.push(result.value);
      } else {
        const error = result.reason;
        if (error instanceof DutyAlreadySignedError || error instanceof SlashingProtectionError) {
          this.log.info(
            `Attestation for slot ${proposal.slotNumber} by ${attestors[i]} already signed by another High-Availability node`,
          );
          // Continue with remaining attestors
        } else {
          throw error;
        }
      }
    }

    return attestations;
  }

  /**
   * Sign attestations and signers payload
   * @param attestationsAndSigners - The attestations and signers to sign
   * @param proposer - The proposer address to sign with
   * @param slot - The slot number for HA signing context
   * @param blockNumber - The block or checkpoint number for HA signing context
   * @returns signature
   * @throws DutyAlreadySignedError if already signed by another HA node
   * @throws SlashingProtectionError if attempting to sign different data for same slot
   */
  signAttestationsAndSigners(
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    proposer: EthAddress,
    slot: SlotNumber,
    blockNumber: BlockNumber | CheckpointNumber,
  ): Promise<Signature> {
    const context: SigningContext = {
      slot,
      blockNumber,
      dutyType: DutyType.ATTESTATIONS_AND_SIGNERS,
    };

    const buf = Buffer32.fromBuffer(
      keccak256(attestationsAndSigners.getPayloadToSign(SignatureDomainSeparator.attestationsAndSigners)),
    );
    return this.keyStore.signMessageWithAddress(proposer, buf, context);
  }
}
