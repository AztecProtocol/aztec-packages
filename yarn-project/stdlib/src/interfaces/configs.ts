import type { EthAddress } from '@aztec/foundation/eth-address';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import { type ZodFor, schemas } from '../schemas/index.js';
import { type AllowedElement, AllowedElementSchema } from './allowed_element.js';

/**
 * The sequencer configuration.
 */
export interface SequencerConfig {
  /** The number of ms to wait between polling for pending txs. */
  transactionPollingIntervalMS?: number;
  /** The maximum number of txs to include in a block. */
  maxTxsPerBlock?: number;
  /** The minimum number of txs to include in a block. */
  minTxsPerBlock?: number;
  /** Whether to publish txs with the block proposals */
  publishTxsWithProposals?: boolean;
  /** The maximum L2 block gas. */
  maxL2BlockGas?: number;
  /** The maximum DA block gas. */
  maxDABlockGas?: number;
  /** Recipient of block reward. */
  coinbase?: EthAddress;
  /** Address to receive fees. */
  feeRecipient?: AztecAddress;
  /** The working directory to use for simulation/proving */
  acvmWorkingDirectory?: string;
  /** The path to the ACVM binary */
  acvmBinaryPath?: string;
  /** The list of functions calls allowed to run in setup */
  txPublicSetupAllowList?: AllowedElement[];
  /** Max block size */
  maxBlockSizeInBytes?: number;
  /** Payload address to vote for */
  governanceProposerPayload?: EthAddress;
  /** Whether to enforce the time table when building blocks */
  enforceTimeTable?: boolean;
  /** How many seconds into an L1 slot we can still send a tx and get it mined. */
  maxL1TxInclusionTimeIntoSlot?: number;
  /** Used for testing to introduce a fake delay after processing each tx */
  fakeProcessingDelayPerTxMs?: number;
  /** How many seconds it takes for proposals and attestations to travel across the p2p layer (one-way) */
  attestationPropagationTime?: number;
}

export const SequencerConfigSchema = z.object({
  transactionPollingIntervalMS: z.number().optional(),
  maxTxsPerBlock: z.number().optional(),
  minTxsPerBlock: z.number().optional(),
  maxL2BlockGas: z.number().optional(),
  publishTxsWithProposals: z.boolean().optional(),
  maxDABlockGas: z.number().optional(),
  coinbase: schemas.EthAddress.optional(),
  feeRecipient: schemas.AztecAddress.optional(),
  acvmWorkingDirectory: z.string().optional(),
  acvmBinaryPath: z.string().optional(),
  txPublicSetupAllowList: z.array(AllowedElementSchema).optional(),
  maxBlockSizeInBytes: z.number().optional(),
  governanceProposerPayload: schemas.EthAddress.optional(),
  maxL1TxInclusionTimeIntoSlot: z.number().optional(),
  enforceTimeTable: z.boolean().optional(),
  fakeProcessingDelayPerTxMs: z.number().optional(),
  attestationPropagationTime: z.number().optional(),
}) satisfies ZodFor<SequencerConfig>;
