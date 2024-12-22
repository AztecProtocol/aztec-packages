import { type AztecAddress, type EthAddress, type Fr, type FunctionSelector } from '@aztec/circuits.js';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

type AllowedInstance = { address: AztecAddress };
type AllowedInstanceFunction = { address: AztecAddress; selector: FunctionSelector };
type AllowedClass = { classId: Fr };
type AllowedClassFunction = { classId: Fr; selector: FunctionSelector };

export type AllowedElement = AllowedInstance | AllowedInstanceFunction | AllowedClass | AllowedClassFunction;

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
  /** Recipient of block reward. */
  coinbase?: EthAddress;
  /** Address to receive fees. */
  feeRecipient?: AztecAddress;
  /** The working directory to use for simulation/proving */
  acvmWorkingDirectory?: string;
  /** The path to the ACVM binary */
  acvmBinaryPath?: string;
  /** The list of functions calls allowed to run in setup */
  allowedInSetup?: AllowedElement[];
  /** Max block size */
  maxBlockSizeInBytes?: number;
  /** Whether to require every tx to have a fee payer */
  enforceFees?: boolean;
  /** Payload address to vote for */
  governanceProposerPayload?: EthAddress;
  /** Whether to enforce the time table when building blocks */
  enforceTimeTable?: boolean;
}

const AllowedElementSchema = z.union([
  z.object({ address: schemas.AztecAddress, selector: schemas.FunctionSelector }),
  z.object({ address: schemas.AztecAddress }),
  z.object({ classId: schemas.Fr, selector: schemas.FunctionSelector }),
  z.object({ classId: schemas.Fr }),
]) satisfies ZodFor<AllowedElement>;

export const SequencerConfigSchema = z.object({
  transactionPollingIntervalMS: z.number().optional(),
  maxTxsPerBlock: z.number().optional(),
  minTxsPerBlock: z.number().optional(),
  coinbase: schemas.EthAddress.optional(),
  feeRecipient: schemas.AztecAddress.optional(),
  acvmWorkingDirectory: z.string().optional(),
  acvmBinaryPath: z.string().optional(),
  allowedInSetup: z.array(AllowedElementSchema).optional(),
  maxBlockSizeInBytes: z.number().optional(),
  enforceFees: z.boolean().optional(),
  gerousiaPayload: schemas.EthAddress.optional(),
}) satisfies ZodFor<SequencerConfig>;
