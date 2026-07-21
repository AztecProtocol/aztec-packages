import { type CheckpointNumber, IndexWithinCheckpoint, type SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { createLogger } from '@aztec/foundation/log';
import { CommitteeAttestationsAndSigners } from '@aztec/stdlib/block';
import {
  BlockProposal,
  type BlockProposalOptions,
  CheckpointAttestation,
  CheckpointProposal,
  type CheckpointProposalCore,
  type CheckpointProposalOptions,
  ConsensusPayload,
  type CoordinationSignatureContext,
  getCoordinationSignatureTypedData,
} from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { BlockHeader, Tx } from '@aztec/stdlib/tx';
import { DutyAlreadySignedError, SlashingProtectionError } from '@aztec/validator-ha-signer/errors';
import { DutyType, type SigningContext } from '@aztec/validator-ha-signer/types';

import type { ValidatorKeyStore } from '../key_store/interface.js';

export class ValidationService {
  constructor(
    private keyStore: ValidatorKeyStore,
    private signatureContext: CoordinationSignatureContext,
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
    checkpointNumber: CheckpointNumber,
    blockIndexWithinCheckpoint: IndexWithinCheckpoint,
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
    const payloadSigner = (
      typedData: Parameters<ValidatorKeyStore['signTypedDataWithAddress']>[1],
      context: SigningContext,
    ) => this.keyStore.signTypedDataWithAddress(address, typedData, context);
    const txsSigner = (
      typedData: Parameters<ValidatorKeyStore['signTypedDataWithAddress']>[1],
      context: SigningContext,
    ) => this.keyStore.signTypedDataWithAddress(address, typedData, context);

    return BlockProposal.createProposalFromSigner(
      blockHeader,
      checkpointNumber,
      blockIndexWithinCheckpoint,
      inHash,
      archive,
      txs.map(tx => tx.getTxHash()),
      options.publishFullTxs ? txs : undefined,
      this.signatureContext,
      payloadSigner,
      txsSigner,
    );
  }

  /**
   * Create a checkpoint proposal with the last block header and checkpoint header
   *
   * @param checkpointHeader - The checkpoint header containing aggregated data
   * @param archive - The archive of the checkpoint
   * @param lastBlockProposal - Signed block proposal for the last block in the checkpoint, or undefined
   * @param proposerAttesterAddress - The address of the proposer
   * @param options - Checkpoint proposal options
   *
   * @returns A checkpoint proposal signing the above information
   */
  public createCheckpointProposal(
    checkpointHeader: CheckpointHeader,
    archive: Fr,
    checkpointNumber: CheckpointNumber,
    feeAssetPriceModifier: bigint,
    lastBlockProposal: BlockProposal | undefined,
    proposerAttesterAddress: EthAddress | undefined,
    options: CheckpointProposalOptions,
  ): Promise<CheckpointProposal> {
    // For testing: corrupt the checkpoint so observers' checkpoint validation fails.
    //
    // Keep `archive` aligned with `lastBlockProposal.archiveRoot` so the archive-based lookup
    // in `validateCheckpointProposal` (`getBlockData({ archive })`) still succeeds
    if (options.broadcastInvalidCheckpointProposal) {
      archive = lastBlockProposal?.archiveRoot ?? Fr.random();
      checkpointHeader = CheckpointHeader.from({
        ...checkpointHeader,
        epochOutHash: Fr.random(),
      });
      this.log.warn(`Creating INVALID checkpoint proposal for slot ${checkpointHeader.slotNumber}`);
    }

    // Create a signer that takes payload and context, and uses the appropriate address
    const payloadSigner = (
      typedData: Parameters<ValidatorKeyStore['signTypedDataWithAddress']>[1],
      context: SigningContext,
    ) => {
      const address = proposerAttesterAddress ?? this.keyStore.getAddress(0);
      return this.keyStore.signTypedDataWithAddress(address, typedData, context);
    };

    return CheckpointProposal.createProposalFromSigner(
      checkpointHeader,
      archive,
      checkpointNumber,
      feeAssetPriceModifier,
      lastBlockProposal,
      this.signatureContext,
      payloadSigner,
    );
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
    checkpointNumber: CheckpointNumber,
  ): Promise<CheckpointAttestation[]> {
    // Create the attestation payload from the checkpoint proposal
    const payload = new ConsensusPayload(
      proposal.checkpointHeader,
      proposal.archive,
      proposal.feeAssetPriceModifier,
      this.signatureContext,
    );
    const typedData = getCoordinationSignatureTypedData(payload);

    const context: SigningContext = {
      slot: proposal.slotNumber,
      checkpointNumber,
      dutyType: DutyType.ATTESTATION,
    };

    // Sign each attestor in parallel, catching HA errors per-attestor
    const results = await Promise.allSettled(
      attestors.map(async attestor => {
        const sig = await this.keyStore.signTypedDataWithAddress(attestor, typedData, context);
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
          this.log.verbose(
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
   * @returns signature
   * @throws DutyAlreadySignedError if already signed by another HA node
   * @throws SlashingProtectionError if attempting to sign different data for same slot
   */
  signAttestationsAndSigners(
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    proposer: EthAddress,
    slot: SlotNumber,
    checkpointNumber: CheckpointNumber,
  ): Promise<Signature> {
    const context: SigningContext = {
      slot,
      checkpointNumber,
      dutyType: DutyType.ATTESTATIONS_AND_SIGNERS,
    };

    const typedData = getCoordinationSignatureTypedData(attestationsAndSigners);
    return this.keyStore.signTypedDataWithAddress(proposer, typedData, context);
  }
}
