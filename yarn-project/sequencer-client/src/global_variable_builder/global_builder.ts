import type { RollupFeeReader, SimulationOverridesPlan } from '@aztec/ethereum/contracts';
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
 *
 * The min-fee `eth_call` (and the state-override translation it needs) is routed through the shared
 * {@link RollupFeeReader}, so a simulation that already computed the same slot's fee against the same
 * plan reuses that result instead of hitting L1 again.
 */
export class GlobalVariableBuilder implements GlobalVariableBuilderInterface {
  private readonly aztecSlotDuration: number;
  private readonly l1GenesisTime: bigint;

  private chainId: Fr;
  private version: Fr;

  constructor(
    publicClient: ViemPublicClient,
    config: GlobalVariableBuilderConfig,
    private readonly feeReader: RollupFeeReader,
  ) {
    this.version = new Fr(config.rollupVersion);
    this.chainId = new Fr(publicClient.chain!.id);

    this.aztecSlotDuration = config.slotDuration;
    this.l1GenesisTime = config.l1GenesisTime;
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

    const gasFees = new GasFees(0, await this.feeReader.getManaMinFeeAt(timestamp, true, simulationOverridesPlan));

    return { chainId, version, slotNumber, timestamp, coinbase, feeRecipient, gasFees };
  }
}
