import { type AztecAddress, type EthAddress, GasFees, GlobalVariables } from '@aztec/circuits.js';
import { type L1ReaderConfig, createEthereumChain } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';

import {
  type GetContractReturnType,
  type HttpTransport,
  type PublicClient,
  createPublicClient,
  getAddress,
  getContract,
  http,
} from 'viem';
import type * as chains from 'viem/chains';

/**
 * Simple global variables builder for devnet. Uses current timestamp and slots equal to block numbers.
 */
export class DevnetGlobalVariableBuilder {
  private log = createDebugLogger('aztec:sequencer:devnet_global_variable_builder');

  private rollupContract: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, chains.Chain>>;
  private publicClient: PublicClient<HttpTransport, chains.Chain>;

  constructor(config: L1ReaderConfig) {
    const { l1RpcUrl, l1ChainId: chainId, l1Contracts } = config;

    const chain = createEthereumChain(l1RpcUrl, chainId);

    this.publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: http(chain.rpcUrl),
    });

    this.rollupContract = getContract({
      address: getAddress(l1Contracts.rollupAddress.toString()),
      abi: RollupAbi,
      client: this.publicClient,
    });
  }

  /**
   * Simple builder of global variables that use the minimum time possible.
   * @param blockNumber - The block number to build global variables for.
   * @param coinbase - The address to receive block reward.
   * @param feeRecipient - The address to receive fees.
   * @returns The global variables for the given block number.
   */
  public async buildGlobalVariables(
    blockNumber: Fr,
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
  ): Promise<GlobalVariables> {
    const version = new Fr(await this.rollupContract.read.VERSION());
    const chainId = new Fr(this.publicClient.chain.id);
    const timestamp = new Fr(Math.floor(Date.now() / 1000));
    const slot = blockNumber;

    const gasFees = GasFees.default();
    const globalVariables = new GlobalVariables(
      chainId,
      version,
      blockNumber,
      slot,
      timestamp,
      coinbase,
      feeRecipient,
      gasFees,
    );
    this.log.debug(`Built global variables for block ${blockNumber}`, globalVariables.toJSON());
    return globalVariables;
  }
}
