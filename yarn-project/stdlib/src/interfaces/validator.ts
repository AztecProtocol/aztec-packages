import type { SecretValue } from '@aztec/foundation/config';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import type { SequencerConfig, SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type { BlockAttestation, BlockProposal, BlockProposalOptions } from '@aztec/stdlib/p2p';
import type { StateReference, Tx } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';
import { z } from 'zod';

import type { CommitteeAttestationsAndSigners } from '../block/index.js';
import type { CheckpointHeader } from '../rollup/checkpoint_header.js';

/**
 * Validator client configuration
 */
export interface ValidatorClientConfig {
  /** The private keys of the validators participating in attestation duties */
  sequencerPrivateKeys?: SecretValue<`0x${string}`[]>;

  /** The addresses of the validators to use with remote signers */
  validatorAddresses?: EthAddress[];

  /** Do not run the validator */
  disableSequencer: boolean;

  /** Temporarily disable these specific validator addresses */
  disabledSequencers: EthAddress[];

  /** Interval between polling for new attestations from peers */
  attestationPollingIntervalMs: number;

  /** Re-execute transactions before attesting */
  sequencerReexecute: boolean;

  /** Will re-execute until this many milliseconds are left in the slot */
  sequencerReexecuteDeadlineMs: number;
}

export type ValidatorClientFullConfig = ValidatorClientConfig &
  Pick<SequencerConfig, 'txPublicSetupAllowList'> &
  Pick<SlasherConfig, 'slashBroadcastedInvalidBlockPenalty'>;

export const ValidatorClientConfigSchema = z.object({
  validatorAddresses: z.array(schemas.EthAddress).optional(),
  disableSequencer: z.boolean(),
  disabledSequencers: z.array(schemas.EthAddress),
  attestationPollingIntervalMs: z.number().min(0),
  sequencerReexecute: z.boolean(),
  sequencerReexecuteDeadlineMs: z.number().min(0),
}) satisfies ZodFor<Omit<ValidatorClientConfig, 'sequencerPrivateKeys'>>;

export interface Validator {
  start(): Promise<void>;
  registerBlockProposalHandler(): void;
  updateConfig(config: Partial<ValidatorClientFullConfig>): void;

  // Block validation responsibilities
  createBlockProposal(
    blockNumber: number,
    header: CheckpointHeader,
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
