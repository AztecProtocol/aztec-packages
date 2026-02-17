import type { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { schemas, zodFor } from '@aztec/foundation/schemas';
import type { SequencerConfig, SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type {
  BlockProposal,
  BlockProposalOptions,
  CheckpointAttestation,
  CheckpointLastBlockData,
  CheckpointProposal,
  CheckpointProposalOptions,
} from '@aztec/stdlib/p2p';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { BlockHeader, Tx } from '@aztec/stdlib/tx';
import { type ValidatorHASignerConfig, ValidatorHASignerConfigSchema } from '@aztec/validator-ha-signer/config';

import type { PeerId } from '@libp2p/interface';
import { z } from 'zod';

import type { CommitteeAttestationsAndSigners } from '../block/index.js';
import { AllowedElementSchema } from './allowed_element.js';

/**
 * Validator client configuration
 */
export type ValidatorClientConfig = ValidatorHASignerConfig & {
  /** The private keys of the validators participating in attestation duties */
  validatorPrivateKeys?: SecretValue<`0x${string}`[]>;

  /** The addresses of the validators to use with remote signers */
  validatorAddresses?: EthAddress[];

  /** Do not run the validator */
  disableValidator: boolean;

  /** Temporarily disable these specific validator addresses */
  disabledValidators: EthAddress[];

  /** Interval between polling for new attestations from peers */
  attestationPollingIntervalMs: number;

  /** Whether to re-execute transactions in a block proposal before attesting */
  validatorReexecute: boolean;

  /** Whether to always reexecute block proposals, even for non-validator nodes or when out of the currnet committee */
  alwaysReexecuteBlockProposals?: boolean;

  /** Whether to run in fisherman mode: validates all proposals and attestations but does not broadcast attestations or participate in consensus */
  fishermanMode?: boolean;

  /** Skip checkpoint proposal validation and always attest (default: false) */
  skipCheckpointProposalValidation?: boolean;

  /** Skip pushing re-executed blocks to archiver (default: false) */
  skipPushProposedBlocksToArchiver?: boolean;

  /** Agree to attest to equivocated checkpoint proposals (for testing purposes only) */
  attestToEquivocatedProposals?: boolean;
};

export type ValidatorClientFullConfig = ValidatorClientConfig &
  Pick<SequencerConfig, 'txPublicSetupAllowList' | 'broadcastInvalidBlockProposal'> &
  Pick<
    SlasherConfig,
    'slashBroadcastedInvalidBlockPenalty' | 'slashDuplicateProposalPenalty' | 'slashDuplicateAttestationPenalty'
  > & {
    /**
     * Whether transactions are disabled for this node
     * @remarks This should match the property in P2PConfig. It's not picked from there to avoid circular dependencies.
     */
    disableTransactions?: boolean;
  };

export const ValidatorClientConfigSchema = zodFor<Omit<ValidatorClientConfig, 'validatorPrivateKeys'>>()(
  ValidatorHASignerConfigSchema.extend({
    validatorAddresses: z.array(schemas.EthAddress).optional(),
    disableValidator: z.boolean(),
    disabledValidators: z.array(schemas.EthAddress),
    attestationPollingIntervalMs: z.number().min(0),
    validatorReexecute: z.boolean(),
    alwaysReexecuteBlockProposals: z.boolean().optional(),
    fishermanMode: z.boolean().optional(),
    skipCheckpointProposalValidation: z.boolean().optional(),
    skipPushProposedBlocksToArchiver: z.boolean().optional(),
    attestToEquivocatedProposals: z.boolean().optional(),
  }),
);

export const ValidatorClientFullConfigSchema = zodFor<Omit<ValidatorClientFullConfig, 'validatorPrivateKeys'>>()(
  ValidatorClientConfigSchema.extend({
    txPublicSetupAllowList: z.array(AllowedElementSchema).optional(),
    broadcastInvalidBlockProposal: z.boolean().optional(),
    slashBroadcastedInvalidBlockPenalty: schemas.BigInt,
    slashDuplicateProposalPenalty: schemas.BigInt,
    slashDuplicateAttestationPenalty: schemas.BigInt,
    disableTransactions: z.boolean().optional(),
  }),
);

export type CreateCheckpointProposalLastBlockData = Omit<CheckpointLastBlockData, 'txHashes'> & { txs: Tx[] };

export interface Validator {
  start(): Promise<void>;
  updateConfig(config: Partial<ValidatorClientFullConfig>): void;

  // Block validation responsibilities
  createBlockProposal(
    blockHeader: BlockHeader,
    indexWithinCheckpoint: number,
    inHash: Fr,
    archive: Fr,
    txs: Tx[],
    proposerAddress: EthAddress | undefined,
    options: BlockProposalOptions,
  ): Promise<BlockProposal | undefined>;

  /** Creates a checkpoint proposal for the last block in a checkpoint */
  createCheckpointProposal(
    checkpointHeader: CheckpointHeader,
    archive: Fr,
    feeAssetPriceModifier: bigint,
    lastBlockInfo: CreateCheckpointProposalLastBlockData | undefined,
    proposerAddress: EthAddress | undefined,
    options: CheckpointProposalOptions,
  ): Promise<CheckpointProposal>;

  /**
   * Validate a block proposal from a peer.
   * Note: Validators do NOT attest to individual blocks - attestations are only for checkpoint proposals.
   * @returns true if the proposal is valid, false otherwise
   */
  validateBlockProposal(proposal: BlockProposal, sender: PeerId): Promise<boolean>;

  /**
   * Validate and attest to a checkpoint proposal from a peer.
   * @returns Checkpoint attestations if valid, undefined otherwise
   */
  attestToCheckpointProposal(
    proposal: CheckpointProposal,
    sender: PeerId,
  ): Promise<CheckpointAttestation[] | undefined>;

  broadcastBlockProposal(proposal: BlockProposal): Promise<void>;

  /** Collect own attestations for a checkpoint proposal (used when skipping p2p attestation collection) */
  collectOwnAttestations(proposal: CheckpointProposal): Promise<CheckpointAttestation[]>;

  /** Collect attestations from the p2p network for a checkpoint proposal */
  collectAttestations(proposal: CheckpointProposal, required: number, deadline: Date): Promise<CheckpointAttestation[]>;

  signAttestationsAndSigners(
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    proposer: EthAddress,
    slot: SlotNumber,
    blockNumber: BlockNumber | CheckpointNumber,
  ): Promise<Signature>;
}
