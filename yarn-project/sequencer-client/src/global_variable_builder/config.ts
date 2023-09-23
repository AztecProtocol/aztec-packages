import { L1ContractAddresses } from '@aztec/ethereum';

/**
 * Configuration of the L1GlobalReader.
 */
export interface GlobalReaderConfig extends L1ContractAddresses {
  /**
   * The RPC Url of the ethereum host.
   */
  rpcUrl: string;
  /**
   * The API key of the ethereum host.
   */
  apiKey?: string;
}
