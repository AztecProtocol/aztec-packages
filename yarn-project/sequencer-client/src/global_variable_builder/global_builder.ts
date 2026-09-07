import {
  RollupContract,
  type SimulationOverridesPlan,
  buildSimulationOverridesStateOverride,
} from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import type { SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type L1RollupConstants, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type {
  CheckpointGlobalVariables,
  GlobalVariableBuilder as GlobalVariableBuilderInterface,
} from '@aztec/stdlib/tx';

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
  private readonly aztecSlotDuration: number;
  private readonly l1GenesisTime: bigint;

  private chainId: Fr;
  private version: Fr;

  constructor(
    private readonly publicClient: ViemPublicClient,
    config: GlobalVariableBuilderConfig,
  ) {
    this.version = new Fr(config.rollupVersion);
    this.chainId = new Fr(this.publicClient.chain!.id);

    this.aztecSlotDuration = config.slotDuration;
    this.l1GenesisTime = config.l1GenesisTime;

    this.rollupContract = new RollupContract(this.publicClient, config.rollupAddress);
  }

  /**
   * Builds global variables that are constant throughout a checkpoint.
   * @param options - Optional L1 block number to pin the fee read to, so the fee describes the same L1 state
   * the caller planned the block from.
   */
  public async buildCheckpointGlobalVariables(
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    slotNumber: SlotNumber,
    simulationOverridesPlan?: SimulationOverridesPlan,
    options?: { blockNumber?: bigint },
  ): Promise<CheckpointGlobalVariables> {
    const { chainId, version } = this;

    const timestamp = getTimestampForSlot(slotNumber, {
      slotDuration: this.aztecSlotDuration,
      l1GenesisTime: this.l1GenesisTime,
    });

    const stateOverride = await buildSimulationOverridesStateOverride(this.rollupContract, simulationOverridesPlan);
    const gasFees = new GasFees(
      0,
      await this.rollupContract.getManaMinFeeAt(timestamp, true, { stateOverride, ...options }),
    );

    return { chainId, version, slotNumber, timestamp, coinbase, feeRecipient, gasFees };
  }
}
