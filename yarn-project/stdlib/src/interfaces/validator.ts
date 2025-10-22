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
  /** The private keys of the sequencers participating in attestation duties */
  sequencerPrivateKeys?: SecretValue<`0x${string}`[]>;

  /** The addresses of the sequencers to use with remote signers for attestation */
  sequencerAddresses?: EthAddress[];

  /** Do not participate in attestation duties */
  disableSequencer: boolean;

  /** Temporarily disable these specific sequencer addresses */
  disabledSequencers: EthAddress[];

  /** Interval between polling for new attestations from peers */
  attestationPollingIntervalMs: number;

  /** Whether to re-execute transactions in a block proposal before attesting */
  attesterReexecute: boolean;

  /** Will re-execute until this many milliseconds are left in the slot */
  attesterReexecuteDeadlineMs: number;

  /** Whether to always reexecute block proposals, even for non-sequencer nodes or when out of the currnet committee */
  alwaysReexecuteBlockProposals?: boolean;
}

export type ValidatorClientFullConfig = ValidatorClientConfig &
  Pick<SequencerConfig, 'txPublicSetupAllowList' | 'broadcastInvalidBlockProposal'> &
  Pick<SlasherConfig, 'slashBroadcastedInvalidBlockPenalty'>;

export const ValidatorClientConfigSchema = z.object({
  sequencerAddresses: z.array(schemas.EthAddress).optional(),
  disableSequencer: z.boolean(),
  disabledSequencers: z.array(schemas.EthAddress),
  attestationPollingIntervalMs: z.number().min(0),
  attesterReexecute: z.boolean(),
  attesterReexecuteDeadlineMs: z.number().min(0),
  alwaysReexecuteBlockProposals: z.boolean().optional(),
}) satisfies ZodFor<Omit<ValidatorClientConfig, 'sequencerPrivateKeys'>>;

export interface Validator {
  start(): Promise<void>;
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
