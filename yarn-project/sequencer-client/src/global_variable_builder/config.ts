import { L1ContractAddresses, l1ContractAddresses } from '@aztec/ethereum';
import { z } from '@aztec/foundation/zod';

/**
 * Configuration of the L1GlobalReader.
 */
export interface GlobalReaderConfig {
  /**
   * The RPC Url of the ethereum host.
   */
  rpcUrl: string;
  /**
   * The API key of the ethereum host.
   */
  apiKey?: string;

  /**
   * The deployed l1 contract addresses
   */
  l1Contracts: L1ContractAddresses;
}

export const globalReaderConfig = z.object({
  rpcUrl: z.string().url().optional().default('http://127.0.0.1:8545'),
  apiKey: z.string().optional(),
  l1Contracts: l1ContractAddresses,
});
