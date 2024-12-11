import { type GlobalVariableBuilder as GlobalVariableBuilderInterface } from '@aztec/circuit-types';
import { type AztecAddress, type EthAddress, GasFees, GlobalVariables } from '@aztec/circuits.js';
import { type L1ContractsConfig, type L1ReaderConfig, createEthereumChain } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
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
  private log = createLogger('sequencer:global_variable_builder');

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

  /**
   * Computes the "current" base fees, e.g., the price that you currently should pay to get include in the next block
   * @returns Base fees for the expected next block
   */
  public async getCurrentBaseFees(): Promise<GasFees> {
    // Since this might be called in the middle of a slot where a block might have been published,
    // we need to fetch the last block written, and estimate the earliest timestamp for the next block.
    // The timestamp of that last block will act as a lower bound for the next block.

    const lastBlock = await this.rollupContract.read.getBlock([await this.rollupContract.read.getPendingBlockNumber()]);
    const earliestTimestamp = await this.rollupContract.read.getTimestampForSlot([lastBlock.slotNumber + 1n]);
    const nextEthTimestamp = BigInt((await this.publicClient.getBlock()).timestamp + BigInt(this.ethereumSlotDuration));
    const timestamp = earliestTimestamp > nextEthTimestamp ? earliestTimestamp : nextEthTimestamp;

    return new GasFees(Fr.ZERO, new Fr(await this.rollupContract.read.getManaBaseFeeAt([timestamp, true])));
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

    // We can skip much of the logic in getCurrentBaseFees since it we already check that we are not within a slot elsewhere.
    const gasFees = new GasFees(Fr.ZERO, new Fr(await this.rollupContract.read.getManaBaseFeeAt([timestamp, true])));

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

    return globalVariables;
  }
}
