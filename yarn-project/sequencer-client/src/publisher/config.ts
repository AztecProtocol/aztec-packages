import { NULL_KEY, l1ContractAddresses } from '@aztec/ethereum';
import { stringlyNumber, z } from '@aztec/foundation/zod';

export const txSenderConfig = z.object({
  /**
   * The private key to be used by the publisher.
   */
  publisherPrivateKey: z
    .string()
    .regex(/^0x[0-9a-f]+$/i)
    .optional()
    .default(NULL_KEY)
    .transform((val): `0x${string}` => {
      return val.startsWith('0x') ? (val as `0x${string}`) : `0x${val}`;
    }),

  /**
   * The RPC Url of the ethereum host.
   */
  rpcUrl: z.string().url().optional().default('http://127.0.0.1:8545'),

  /**
   * The API key of the ethereum host.
   */
  apiKey: z.string().optional(),

  /**
   * The number of confirmations required.
   */
  requiredConfirmations: stringlyNumber.default(1),

  /**
   * The deployed l1 contract addresses
   */
  l1Contracts: l1ContractAddresses,
});

/**
 * The configuration of the rollup transaction publisher.
 */
export type TxSenderConfig = z.infer<typeof txSenderConfig>;

export const publisherConfig = z.object({
  /**
   * The interval to wait between publish retries.
   */
  l1BlockPublishRetryIntervalMS: stringlyNumber.default(1000),
});

/**
 * Configuration of the L1Publisher.
 */
export type PublisherConfig = z.infer<typeof publisherConfig>;
