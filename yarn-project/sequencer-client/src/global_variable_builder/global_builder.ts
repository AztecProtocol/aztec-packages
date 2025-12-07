import {
  type L1ContractsConfig,
  type L1ReaderConfig,
  RollupContract,
  type ViemPublicClient,
  // merkezî viem public client helper
  getPublicClient,
} from '@aztec/ethereum';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import type { GlobalVariableBuilder as GlobalVariableBuilderInterface } from '@aztec/stdlib/tx';
import { GlobalVariables } from '@aztec/stdlib/tx';

/**
 * Simple global variables builder.
 */
export class GlobalVariableBuilder implements GlobalVariableBuilderInterface {
  private log = createLogger('sequencer:global_variable_builder');
  private currentBaseFees: Promise<GasFees> = Promise.resolve(new GasFees(0, 0));
  private currentL1BlockNumber: bigint | undefined = undefined;

  private readonly rollupContract: RollupContract;
  private readonly publicClient: ViemPublicClient;
  private readonly ethereumSlotDuration: number;

  private chainId?: Fr;
  private version?: Fr;

  constructor(config: L1ReaderConfig & Pick<L1ContractsConfig, 'ethereumSlotDuration'>) {
    const { l1RpcUrls, l1ChainId, l1Contracts } = config;

    this.ethereumSlotDuration = config.ethereumSlotDuration;

    // Merkezî helper: viem fallback + rank + retries + Sepolia public RPC eklemeleri
    this.publicClient = getPublicClient({
      l1RpcUrls,
      l1ChainId,
      viemPollingIntervalMS: config.viemPollingIntervalMS,
    });

    this.rollupContract = new RollupContract(this.publicClient, l1Contracts.rollupAddress);
  }

  /**
   * Computes the "current" base fees, e.g., the price that you currently should pay to get include in the next block
   * @returns Base fees for the next block
   */
  private async computeCurrentBaseFees(): Promise<GasFees> {
    // Since this might be called in the middle of a slot where a block might have been published,
    // we need to fetch the last block written, and estimate the earliest timestamp for the next block.
    // The timestamp of that last block will act as a lower bound for the next block.

    const lastBlock = await this.rollupContract.getCheckpoint(await this.rollupContract.getCheckpointNumber());
    const earliestTimestamp = await this.rollupContract.getTimestampForSlot(
      SlotNumber.fromBigInt(lastBlock.slotNumber + 1n),
    );
    const nextEthTimestamp = BigInt((await this.publicClient.getBlock()).timestamp + BigInt(this.ethereumSlotDuration));
    const timestamp = earliestTimestamp > nextEthTimestamp ? earliestTimestamp : nextEthTimestamp;

    return new GasFees(0, await this.rollupContract.getManaBaseFeeAt(timestamp, true));
  }

  public async getCurrentBaseFees(): Promise<GasFees> {
    // Get the current block number
    const blockNumber = await this.publicClient.getBlockNumber();

    // If the L1 block number has changed then chain a new promise to get the current base fees
    if (this.currentL1BlockNumber === undefined || blockNumber > this.currentL1BlockNumber) {
      this.currentL1BlockNumber = blockNumber;
      this.currentBaseFees = this.currentBaseFees.then(() => this.computeCurrentBaseFees());
    }
    return this.currentBaseFees;
  }

  public async getGlobalConstantVariables(): Promise<Pick<GlobalVariables, 'chainId' | 'version'>> {
    if (!this.chainId) {
      this.chainId = new Fr(this.publicClient.chain.id);
    }
    if (!this.version) {
      this.version = new Fr(await this.rollupContract.getVersion());
    }
    return { chainId: this.chainId, version: this.version };
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
    blockNumber: BlockNumber,
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    slotNumber?: SlotNumber,
  ): Promise<GlobalVariables> {
    const { chainId, version } = await this.getGlobalConstantVariables();

    let slot: SlotNumber;
    if (slotNumber === undefined) {
      const ts = BigInt((await this.publicClient.getBlock()).timestamp + BigInt(this.ethereumSlotDuration));
      slot = await this.rollupContract.getSlotAt(ts);
    } else {
      slot = slotNumber;
    }

    const timestamp = await this.rollupContract.getTimestampForSlot(slot);

    // We can skip much of the logic in getCurrentBaseFees since it we already check that we are not within a slot elsewhere.
    const gasFees = new GasFees(0, await this.rollupContract.getManaBaseFeeAt(timestamp, true));

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

    return globalVariables;
  }
}
