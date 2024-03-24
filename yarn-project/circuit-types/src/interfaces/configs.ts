import { aztecAddress, ethAddress, fr, stringlyNumber, z } from '@aztec/foundation/zod';

export const sequencerConfig = z.object({
  /** The number of ms to wait between polling for pending txs. */
  transactionPollingIntervalMS: stringlyNumber.optional().default(1_000),
  /** The maximum number of txs to include in a block. */
  maxTxsPerBlock: stringlyNumber.optional().default(32),
  /** The minimum number of txs to include in a block. */
  minTxsPerBlock: stringlyNumber.optional().default(1),
  /** Recipient of block reward. */
  coinbase: ethAddress.optional(),
  /** Address to receive fees. */
  feeRecipient: aztecAddress.optional(),
  /** The working directory to use for simulation/proving */
  acvmWorkingDirectory: z.string().optional(),
  /** The path to the ACVM binary */
  acvmBinaryPath: z.string().optional(),

  /** The list of permitted fee payment contract classes */
  allowedFeePaymentContractClasses: z
    .preprocess(val => {
      if (typeof val === 'string') {
        return val.split(',');
      } else {
        return z.NEVER;
      }
    }, z.array(fr))
    .or(z.array(fr))
    .optional()
    .default([]),
  /** The list of permitted fee payment contract instances. Takes precedence over contract classes */
  allowedFeePaymentContractInstances: z
    .preprocess(val => {
      if (typeof val === 'string') {
        return val.split(',');
      } else {
        return z.NEVER;
      }
    }, z.array(aztecAddress))
    .or(z.array(aztecAddress))
    .optional()
    .default([]),
});

/**
 * The sequencer configuration.
 */
export type SequencerConfig = z.infer<typeof sequencerConfig>;
