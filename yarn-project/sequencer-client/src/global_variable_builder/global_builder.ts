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

/**
 * Configuration shared by {@link GlobalVariableBuilder} and {@link FeeProviderImpl}. `ethereumSlotDuration`
 * is only consumed by the fee provider (its predictor uses it to advance L1 timestamps); the
 * global variable builder does not read it because slot decisions are made by callers.
 */
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

  /** Returns the underlying rollup contract for callers that need to read on-chain state. */
  public getRollupContract(): RollupContract {
    return this.rollupContract;
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

  public buildCheckpointGlobalVariablesFromSnapshot(
    coinbase: EthAddress,
    feeRecipient: AztecAddress,
    snapshot: { timestamp: bigint; slotNumber: SlotNumber; gasFees: GasFees },
  ): CheckpointGlobalVariables {
    const { chainId, version } = this;
    return {
      chainId,
      version,
      slotNumber: snapshot.slotNumber,
      timestamp: snapshot.timestamp,
      coinbase,
      feeRecipient,
      gasFees: snapshot.gasFees,
    };
  }
}
