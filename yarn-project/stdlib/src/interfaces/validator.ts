import type { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
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
  CheckpointProposal,
  CheckpointProposalOptions,
  ValidatedBlockProposal,
  ValidatedCheckpointProposalCore,
} from '@aztec/stdlib/p2p';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { BlockHeader, Tx } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { z } from 'zod';

import type { CommitteeAttestationsAndSigners } from '../block/index.js';
import type { ChainConfig } from '../config/chain-config.js';
import {
  type LocalSignerConfig,
  LocalSignerConfigSchema,
  type ValidatorHASignerConfig,
  ValidatorHASignerConfigSchema,
} from '../ha-signing/index.js';
import { AllowedElementSchema } from './allowed_element.js';

/**
 * Validator client configuration
 */
export type ValidatorClientConfig = ValidatorHASignerConfig &
  LocalSignerConfig & {
    /** The L1 chain id used for EIP-712 proposal-path signing. */
    l1ChainId: ChainConfig['l1ChainId'];

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

    /** Whether to always reexecute block proposals, even for non-validator nodes or when out of the current committee */
    alwaysReexecuteBlockProposals?: boolean;

    /** Whether to run in fisherman mode: validates all proposals and attestations but does not broadcast attestations or participate in consensus */
    fishermanMode?: boolean;

    /** Skip checkpoint proposal validation and always attest (default: false) */
    skipCheckpointProposalValidation?: boolean;

    /** Skip pushing re-executed blocks to archiver (default: false) */
    skipPushProposedBlocksToArchiver?: boolean;

    /** Agree to attest to equivocated checkpoint proposals (for testing purposes only) */
    attestToEquivocatedProposals?: boolean;

    /** Accept proposal validation regardless of slot timing (for testing only) */
    skipProposalSlotValidation?: boolean;

    /** Maximum L2 gas per block for validation. Proposals exceeding this limit are rejected. */
    validateMaxL2BlockGas?: number;

    /** Maximum DA gas per block for validation. Proposals exceeding this limit are rejected. */
    validateMaxDABlockGas?: number;

    /** Maximum transactions per block for validation. Proposals exceeding this limit are rejected. */
    validateMaxTxsPerBlock?: number;

    /** Maximum transactions per checkpoint for validation. Proposals exceeding this limit are rejected. */
    validateMaxTxsPerCheckpoint?: number;
  };

export type ValidatorClientFullConfig = ValidatorClientConfig &
  Pick<SequencerConfig, 'txPublicSetupAllowListExtend' | 'broadcastInvalidBlockProposal' | 'maxBlocksPerCheckpoint'> &
  // `blockDurationMs` is optional on the loose `SequencerConfig` but is always populated via the shared
  // `numberConfigHelper(3000)` mapping, so it is required on the fully-resolved validator config.
  Required<Pick<SequencerConfig, 'blockDurationMs'>> &
  Pick<
    SlasherConfig,
    | 'slashBroadcastedInvalidBlockPenalty'
    | 'slashBroadcastedInvalidCheckpointProposalPenalty'
    | 'slashDuplicateProposalPenalty'
    | 'slashDuplicateAttestationPenalty'
    | 'slashAttestInvalidCheckpointProposalPenalty'
  > & {
    /**
     * Whether transactions are disabled for this node
     * @remarks This should match the property in P2PConfig. It's not picked from there to avoid circular dependencies.
     */
    disableTransactions?: boolean;

    /**
     * Maximum clock-disparity tolerance (ms) applied to proposal/attestation receive windows.
     * @remarks Mirrors the property in P2PConfig. It's not picked from there to avoid circular dependencies.
     */
    maxGossipClockDisparityMs?: number;
  };

export const ValidatorClientConfigSchema = zodFor<Omit<ValidatorClientConfig, 'validatorPrivateKeys'>>()(
  ValidatorHASignerConfigSchema.merge(LocalSignerConfigSchema).extend({
    l1ChainId: z.number().int().nonnegative(),
    validatorAddresses: z.array(schemas.EthAddress).optional(),
    disableValidator: z.boolean(),
    disabledValidators: z.array(schemas.EthAddress),
    attestationPollingIntervalMs: z.number().min(0),
    alwaysReexecuteBlockProposals: z.boolean().optional(),
    fishermanMode: z.boolean().optional(),
    skipCheckpointProposalValidation: z.boolean().optional(),
    skipPushProposedBlocksToArchiver: z.boolean().optional(),
    attestToEquivocatedProposals: z.boolean().optional(),
    skipProposalSlotValidation: z.boolean().optional(),
    validateMaxL2BlockGas: z.number().optional(),
    validateMaxDABlockGas: z.number().optional(),
    validateMaxTxsPerBlock: z.number().optional(),
    validateMaxTxsPerCheckpoint: z.number().optional(),
  }),
);

export const ValidatorClientFullConfigSchema = zodFor<Omit<ValidatorClientFullConfig, 'validatorPrivateKeys'>>()(
  ValidatorClientConfigSchema.extend({
    txPublicSetupAllowListExtend: z.array(AllowedElementSchema).optional(),
    broadcastInvalidBlockProposal: z.boolean().optional(),
    blockDurationMs: z.number().positive(),
    maxBlocksPerCheckpoint: z.number().positive().optional(),
    slashBroadcastedInvalidBlockPenalty: schemas.BigInt,
    slashBroadcastedInvalidCheckpointProposalPenalty: schemas.BigInt,
    slashDuplicateProposalPenalty: schemas.BigInt,
    slashDuplicateAttestationPenalty: schemas.BigInt,
    slashAttestInvalidCheckpointProposalPenalty: schemas.BigInt,
    disableTransactions: z.boolean().optional(),
    maxGossipClockDisparityMs: z.number().optional(),
  }),
);

export interface Validator {
  start(): Promise<void>;
  updateConfig(config: Partial<ValidatorClientFullConfig>): void;

  // Block validation responsibilities
  createBlockProposal(
    blockHeader: BlockHeader,
    checkpointNumber: CheckpointNumber,
    indexWithinCheckpoint: number,
    archive: Fr,
    txs: Tx[],
    proposerAddress: EthAddress | undefined,
    options: BlockProposalOptions,
  ): Promise<BlockProposal | undefined>;

  /** Creates a checkpoint proposal for the last block in a checkpoint */
  createCheckpointProposal(
    checkpointHeader: CheckpointHeader,
    archive: Fr,
    checkpointNumber: CheckpointNumber,
    feeAssetPriceModifier: bigint,
    lastBlockProposal: BlockProposal | undefined,
    proposerAddress: EthAddress | undefined,
    options: CheckpointProposalOptions,
  ): Promise<CheckpointProposal>;

  /**
   * Validate a block proposal from a peer that has already passed p2p ingress validation.
   * Note: Validators do NOT attest to individual blocks - attestations are only for checkpoint proposals.
   * @returns true if the proposal is valid, false otherwise
   */
  validateBlockProposal(proposal: ValidatedBlockProposal, sender: PeerId): Promise<boolean>;

  /**
   * Validate and attest to a checkpoint proposal from a peer that has already passed p2p ingress validation.
   * @returns Checkpoint attestations if valid, undefined otherwise
   */
  attestToCheckpointProposal(
    proposal: ValidatedCheckpointProposalCore,
    sender: PeerId,
  ): Promise<CheckpointAttestation[] | undefined>;

  broadcastBlockProposal(proposal: BlockProposal): Promise<void>;

  /** Collect own attestations for a checkpoint proposal (used when skipping p2p attestation collection) */
  collectOwnAttestations(
    proposal: CheckpointProposal,
    checkpointNumber: CheckpointNumber,
  ): Promise<CheckpointAttestation[]>;

  /** Collect attestations from the p2p network for a checkpoint proposal */
  collectAttestations(
    proposal: CheckpointProposal,
    required: number,
    deadline: Date,
    checkpointNumber: CheckpointNumber,
  ): Promise<CheckpointAttestation[]>;

  signAttestationsAndSigners(
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    proposer: EthAddress,
    slot: SlotNumber,
    checkpointNumber: CheckpointNumber,
  ): Promise<Signature>;
}
