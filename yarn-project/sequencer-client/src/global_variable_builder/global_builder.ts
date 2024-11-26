import { type GlobalVariableBuilder as GlobalVariableBuilderInterface } from '@aztec/circuit-types';
import { type AztecAddress, type EthAddress, GasFees, GlobalVariables } from '@aztec/circuits.js';
import { type L1ContractsConfig, type L1ReaderConfig, createEthereumChain } from '@aztec/ethereum';
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
 * Simple global variables builder.
 */
export class GlobalVariableBuilder implements GlobalVariableBuilderInterface {
  private log = createDebugLogger('aztec:sequencer:global_variable_builder');

  private rollupContract: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, chains.Chain>>;
  private publicClient: PublicClient<HttpTransport, chains.Chain>;
  private ethereumSlotDuration: number;

  constructor(config: L1ReaderConfig & Pick<L1ContractsConfig, 'ethereumSlotDuration'>) {
    const { l1RpcUrl, l1ChainId: chainId, l1Contracts } = config;

    const chain = createEthereumChain(l1RpcUrl, chainId);

    this.ethereumSlotDuration = config.ethereumSlotDuration;

    this.publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: http(chain.rpcUrl),
      pollingInterval: config.viemPollingIntervalMS,
    });

    this.rollupContract = getContract({
      address: getAddress(l1Contracts.rollupAddress.toString()),
      abi: RollupAbi,
      client: this.publicClient,
    });
  }

  public async getCurrentBaseFees(): Promise<GasFees> {
    return new GasFees(Fr.ZERO, new Fr(await this.rollupContract.read.getManaBaseFee([true])));
  }

  /**
   * Simple builder of global variables that use the minimum time possible.
   * @param blockNumber - The block number to build global variables for.
   * @param coinbase - The address to receive block reward.
   * @param feeRecipient - The address to receive fees.
   * @param slotNumber - The slot number to use for the global variables, if undefined it will be calculated.
   * @returns The global variables for the given block number.
   */
  public async buildGlobalVariables(
    blockNumber: Fr,
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    slotNumber?: bigint,
  ): Promise<GlobalVariables> {
    const version = new Fr(await this.rollupContract.read.VERSION());
    const chainId = new Fr(this.publicClient.chain.id);

    if (slotNumber === undefined) {
      const ts = BigInt((await this.publicClient.getBlock()).timestamp + BigInt(this.ethereumSlotDuration));
      slotNumber = await this.rollupContract.read.getSlotAt([ts]);
    }

    const timestamp = await this.rollupContract.read.getTimestampForSlot([slotNumber]);

    const slotFr = new Fr(slotNumber);
    const timestampFr = new Fr(timestamp);

    const gasFees = await this.getCurrentBaseFees();

    const globalVariables = new GlobalVariables(
      chainId,
      version,
      blockNumber,
      slotFr,
      timestampFr,
      coinbase,
      feeRecipient,
      gasFees,
    );
    this.log.debug(`Built global variables for block ${blockNumber}`, globalVariables.toFriendlyJSON());
    return globalVariables;
  }
}
