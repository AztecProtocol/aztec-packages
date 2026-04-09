import {
  RollupContract,
  type SimulationOverridesPlan,
  buildSimulationOverridesStateOverride,
} from '@aztec/ethereum/contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type L1RollupConstants, getNextL1SlotTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type {
  CheckpointGlobalVariables,
  GlobalVariableBuilder as GlobalVariableBuilderInterface,
} from '@aztec/stdlib/tx';
import { GlobalVariables } from '@aztec/stdlib/tx';

/** Configuration for the GlobalVariableBuilder (excludes L1 client config). */
export type GlobalVariableBuilderConfig = {
  l1Contracts: Pick<L1ContractAddresses, 'rollupAddress'>;
  ethereumSlotDuration: number;
  rollupVersion: bigint;
} & Pick<L1RollupConstants, 'slotDuration' | 'l1GenesisTime'>;

/**
 * Simple global variables builder.
 */
export class GlobalVariableBuilder implements GlobalVariableBuilderInterface {
  private log = createLogger('sequencer:global_variable_builder');
  private currentMinFees: Promise<GasFees> = Promise.resolve(new GasFees(0, 0));
  private currentL1BlockNumber: bigint | undefined = undefined;

  private readonly rollupContract: RollupContract;
  private readonly ethereumSlotDuration: number;
  private readonly aztecSlotDuration: number;
  private readonly l1GenesisTime: bigint;

  private chainId: Fr;
  private version: Fr;

  constructor(
    private readonly dateProvider: DateProvider,
    private readonly publicClient: ViemPublicClient,
    config: GlobalVariableBuilderConfig,
  ) {
    this.version = new Fr(config.rollupVersion);
    this.chainId = new Fr(this.publicClient.chain!.id);

    this.ethereumSlotDuration = config.ethereumSlotDuration;
    this.aztecSlotDuration = config.slotDuration;
    this.l1GenesisTime = config.l1GenesisTime;

    this.rollupContract = new RollupContract(this.publicClient, config.l1Contracts.rollupAddress);
  }

  /**
   * Computes the "current" min fees, e.g., the price that you currently should pay to get include in the next block
   * @returns Min fees for the next block
   */
  private async computeCurrentMinFees(): Promise<GasFees> {
    // Since this might be called in the middle of a slot where a block might have been published,
    // we need to fetch the last block written, and estimate the earliest timestamp for the next block.
    // The timestamp of that last block will act as a lower bound for the next block.

    const lastCheckpoint = await this.rollupContract.getPendingCheckpoint();
    const earliestTimestamp = await this.rollupContract.getTimestampForSlot(
      SlotNumber.fromBigInt(BigInt(lastCheckpoint.slotNumber) + 1n),
    );
    const nextEthTimestamp = getNextL1SlotTimestamp(this.dateProvider.nowInSeconds(), {
      l1GenesisTime: this.l1GenesisTime,
      ethereumSlotDuration: this.ethereumSlotDuration,
    });
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
        getNextL1SlotTimestamp(this.dateProvider.nowInSeconds(), {
          l1GenesisTime: this.l1GenesisTime,
          ethereumSlotDuration: this.ethereumSlotDuration,
        }),
      ));

    const checkpointGlobalVariables = await this.buildCheckpointGlobalVariables(coinbase, feeRecipient, slot);
    return GlobalVariables.from({ blockNumber, ...checkpointGlobalVariables });
  }

  /** Builds global variables that are constant throughout a checkpoint. */
  public async buildCheckpointGlobalVariables(
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    slotNumber: SlotNumber,
    simulationOverridesPlan?: SimulationOverridesPlan,
  ): Promise<CheckpointGlobalVariables> {
    const { chainId, version } = this;

    const timestamp = getTimestampForSlot(slotNumber, {
      slotDuration: this.aztecSlotDuration,
      l1GenesisTime: this.l1GenesisTime,
    });

    const stateOverride = await buildSimulationOverridesStateOverride(this.rollupContract, simulationOverridesPlan);
    const gasFees = new GasFees(0, await this.rollupContract.getManaMinFeeAt(timestamp, true, stateOverride));

    return { chainId, version, slotNumber, timestamp, coinbase, feeRecipient, gasFees };
  }
}
