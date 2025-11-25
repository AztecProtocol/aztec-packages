import type { SecretValue } from '@aztec/foundation/config';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import type { SequencerConfig, SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type { BlockAttestation, BlockProposal, BlockProposalOptions } from '@aztec/stdlib/p2p';
import type { ProposedBlockHeader, StateReference, Tx } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { z } from 'zod';

import type { CommitteeAttestationsAndSigners } from '../block/index.js';
import { AllowedElementSchema } from './allowed_element.js';

/**
 * Validator client configuration
 */
export interface ValidatorClientConfig {
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

  /** Will re-execute until this many milliseconds are left in the slot */
  validatorReexecuteDeadlineMs: number;

  /** Whether to always reexecute block proposals, even for non-validator nodes or when out of the currnet committee */
  alwaysReexecuteBlockProposals?: boolean;

  /** Whether to run in fisherman mode: validates all proposals and attestations but does not broadcast attestations or participate in consensus */
  fishermanMode?: boolean;
}

export type ValidatorClientFullConfig = ValidatorClientConfig &
  Pick<SequencerConfig, 'txPublicSetupAllowList'> &
  Pick<SlasherConfig, 'slashBroadcastedInvalidBlockPenalty'> & {
    /**
     * Whether transactions are disabled for this node
     * @remarks This should match the property in P2PConfig. It's not picked from there to avoid circular dependencies.
     */
    disableTransactions?: boolean;
  };

export const ValidatorClientConfigSchema = z.object({
  validatorAddresses: z.array(schemas.EthAddress).optional(),
  disableValidator: z.boolean(),
  disabledValidators: z.array(schemas.EthAddress),
  attestationPollingIntervalMs: z.number().min(0),
  validatorReexecute: z.boolean(),
  validatorReexecuteDeadlineMs: z.number().min(0),
  alwaysReexecuteBlockProposals: z.boolean().optional(),
  fishermanMode: z.boolean().optional(),
}) satisfies ZodFor<Omit<ValidatorClientConfig, 'validatorPrivateKeys'>>;

export const ValidatorClientFullConfigSchema = ValidatorClientConfigSchema.extend({
  txPublicSetupAllowList: z.array(AllowedElementSchema).optional(),
  slashBroadcastedInvalidBlockPenalty: schemas.BigInt,
  disableTransactions: z.boolean().optional(),
}) satisfies ZodFor<Omit<ValidatorClientFullConfig, 'validatorPrivateKeys'>>;

export interface Validator {
  start(): Promise<void>;
  updateConfig(config: Partial<ValidatorClientFullConfig>): void;

  // Block validation responsibilities
  createBlockProposal(
    blockNumber: number,
    header: ProposedBlockHeader,
    archive: Fr,
    stateReference: StateReference,
    txs: Tx[],
    proposerAddress: EthAddress | undefined,
    options: BlockProposalOptions,
  ): Promise<BlockProposal | undefined>;
  attestToProposal(proposal: BlockProposal, sender: PeerId): Promise<BlockAttestation[] | undefined>;

  broadcastBlockProposal(proposal: BlockProposal): Promise<void>;
  collectAttestations(proposal: BlockProposal, required: number, deadline: Date): Promise<BlockAttestation[]>;
  signAttestationsAndSigners(
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    proposer: EthAddress,
  ): Promise<Signature>;
}
