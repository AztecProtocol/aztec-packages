import { EthAddress } from '@aztec/circuits.js';

/**
 * Provides basic information about the running node.
 */
export type NodeInfo = {
  /**
   * The version number of the node.
   */
  version: number;
  /**
   * The network's chain id.
   */
  chainId: number;
  /**
   * The rollup contract address
   */
  rollupAddress: EthAddress;
  /**
   * Identifier of the client software.
   */
  client: string;
  /**
   * The nargo version compatible with this node.
   */
  compatibleNargoVersion: string;
};
