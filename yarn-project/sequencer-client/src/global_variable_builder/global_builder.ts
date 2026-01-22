import { createEthereumChain } from '@aztec/ethereum/chain';
import type { L1ContractsConfig } from '@aztec/ethereum/config';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { L1ReaderConfig } from '@aztec/ethereum/l1-reader';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type L1RollupConstants, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type {
  CheckpointGlobalVariables,
  GlobalVariableBuilder as GlobalVariableBuilderInterface,
} from '@aztec/stdlib/tx';
import { GlobalVariables } from '@aztec/stdlib/tx';

import { createPublicClient, fallback, http } from 'viem';

/**
 * Simple global variables builder.
 */
export class GlobalVariableBuilder implements GlobalVariableBuilderInterface {
  private log: Logger;
  private currentMinFees: Promise<GasFees> = Promise.resolve(new GasFees(0, 0));
  private currentL1BlockNumber: bigint | undefined = undefined;

  private readonly rollupContract: RollupContract;
  private readonly publicClient: ViemPublicClient;
  private readonly ethereumSlotDuration: number;
  private readonly aztecSlotDuration: number;
  private readonly l1GenesisTime: bigint;

  private chainId: Fr;
  private version: Fr;

  constructor(
    config: L1ReaderConfig &
      Pick<L1ContractsConfig, 'ethereumSlotDuration'> &
      Pick<L1RollupConstants, 'slotDuration' | 'l1GenesisTime'> & { rollupVersion: bigint },
    log: Logger,
  ) {
    this.log = log;
    const { l1RpcUrls, l1ChainId: chainId, l1Contracts } = config;

    const chain = createEthereumChain(l1RpcUrls, chainId);

    this.version = new Fr(config.rollupVersion);
    this.chainId = new Fr(chainId);

    this.ethereumSlotDuration = config.ethereumSlotDuration;
    this.aztecSlotDuration = config.slotDuration;
    this.l1GenesisTime = config.l1GenesisTime;

    this.publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback(chain.rpcUrls.map(url => http(url, { batch: false }))),
      pollingInterval: config.viemPollingIntervalMS,
    });

    this.rollupContract = new RollupContract(this.publicClient, l1Contracts.rollupAddress, log);
  }

  /**
   * Computes the "current" min fees, e.g., the price that you currently should pay to get include in the next block
   * @returns Min fees for the next block
   */
  private async computeCurrentMinFees(): Promise<GasFees> {
    // Since this might be called in the middle of a slot where a block might have been published,
    // we need to fetch the last block written, and estimate the earliest timestamp for the next block.
    // The timestamp of that last block will act as a lower bound for the next block.

    const lastBlock = await this.rollupContract.getPendingCheckpoint();
    const earliestTimestamp = await this.rollupContract.getTimestampForSlot(
      SlotNumber.fromBigInt(BigInt(lastBlock.slotNumber) + 1n),
    );
    const nextEthTimestamp = BigInt((await this.publicClient.getBlock()).timestamp + BigInt(this.ethereumSlotDuration));
    const timestamp = earliestTimestamp > nextEthTimestamp ? earliestTimestamp : nextEthTimestamp;

    return new GasFees(0, await this.rollupContract.getManaMinFeeAt(timestamp, true));
  }

  public async getCurrentMinFees(): Promise<GasFees> {
    // Get the current block number
    const blockNumber = await this.publicClient.getBlockNumber();

    // If the L1 block number has changed then chain a new promise to get the current min fees
    if (this.currentL1BlockNumber === undefined || blockNumber > this.currentL1BlockNumber) {
      this.currentL1BlockNumber = blockNumber;
      this.currentMinFees = this.currentMinFees.then(() => this.computeCurrentMinFees());
    }
    return this.currentMinFees;
  }

  /**
   * Simple builder of global variables.
   * @param blockNumber - The block number to build global variables for.
   * @param coinbase - The address to receive block reward.
   * @param feeRecipient - The address to receive fees.
   * @param slotNumber - The slot number to use for the global variables, if undefined it will be calculated.
   * @returns The global variables for the given block number.
   */
  public async buildGlobalVariables(
    blockNumber: BlockNumber,
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    maybeSlot?: SlotNumber,
  ): Promise<GlobalVariables> {
    const slot: SlotNumber =
      maybeSlot ??
      (await this.rollupContract.getSlotAt(
        BigInt((await this.publicClient.getBlock()).timestamp + BigInt(this.ethereumSlotDuration)),
      ));

    const checkpointGlobalVariables = await this.buildCheckpointGlobalVariables(coinbase, feeRecipient, slot);
    return GlobalVariables.from({ blockNumber, ...checkpointGlobalVariables });
  }

  /** Builds global variables that are constant throughout a checkpoint. */
  public async buildCheckpointGlobalVariables(
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    slotNumber: SlotNumber,
  ): Promise<CheckpointGlobalVariables & { timestamp: bigint }> {
    const { chainId, version } = this;

    const timestamp = getTimestampForSlot(slotNumber, {
      slotDuration: this.aztecSlotDuration,
      l1GenesisTime: this.l1GenesisTime,
    });

    // We can skip much of the logic in getCurrentMinFees since it we already check that we are not within a slot elsewhere.
    // TODO(palla/mbps): Can we use a cached value here?
    const gasFees = new GasFees(0, await this.rollupContract.getManaMinFeeAt(timestamp, true));

    return { chainId, version, slotNumber, timestamp, coinbase, feeRecipient, gasFees };
  }
}
