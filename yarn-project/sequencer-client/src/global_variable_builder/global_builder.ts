import {
  RollupContract,
  type SimulationOverridesPlan,
  buildSimulationOverridesStateOverride,
} from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
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
  rollupAddress: EthAddress;
  ethereumSlotDuration: number;
  rollupVersion: bigint;
} & Pick<L1RollupConstants, 'slotDuration' | 'l1GenesisTime'>;

/**
 * Simple global variables builder.
 */
export class GlobalVariableBuilder implements GlobalVariableBuilderInterface {
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

    this.rollupContract = new RollupContract(this.publicClient, config.rollupAddress);
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
