import { type Chain } from 'viem';
import { foundry } from 'viem/chains';

import { AZTEC_TEST_CHAIN_ID } from './constants.js';

/**
 * Interface containing the connection and chain properties to interact with a blockchain.
 */
export interface EthereumChain {
  /**
   * An instance of the viem chain data.
   */
  chainInfo: Chain;

  /**
   * The actual url to be used.
   */
  rpcUrl: string;
}

/**
 * Helper function to create an instance of Aztec Chain from an rpc url and api key.
 * @param rpcUrl - The rpc url of the chain or a chain identifier (e.g. 'testnet')
 * @param apiKey - An optional API key for the chain client.
 */
export function createEthereumChain(rpcUrl: string, _chainId: number | string): EthereumChain {
  let chainId: number;
  if (typeof _chainId === 'string') {
    chainId = +_chainId;
  } else {
    chainId = _chainId;
  }
  if (chainId) {
    return {
      chainInfo: {
        id: chainId,
        name: 'Ethereum',
        rpcUrls: {
          default: {
            http: [rpcUrl],
          },
        },
        nativeCurrency: {
          decimals: 18,
          name: 'Ether',
          symbol: 'ETH',
        },
      },
      rpcUrl,
    };
  } else {
    return {
      chainInfo: foundry,
      rpcUrl,
    };
  }
}

/**
 * Helper function to determine if a chain id is an instance of Anvil
 */
export function isAnvilTestChain(_chainId: number | string): boolean {
  let chainId: number;
  if (typeof _chainId === 'string') {
    chainId = +_chainId;
  } else {
    chainId = _chainId;
  }
  const testChains = [foundry.id, AZTEC_TEST_CHAIN_ID];
  return testChains.includes(chainId);
}
