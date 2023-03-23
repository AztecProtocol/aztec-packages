import { EthAddress } from '@aztec/ethereum.js/eth_address';

/**
 * Rollup contract addresses.
 */
export interface L1Addresses {
  /**
   * Rollup contract address.
   */
  rollupContract: EthAddress;
}

export * from './ethereumjs-contracts/Rollup.js';
export * from './ethereumjs-contracts/Yeeter.js';
