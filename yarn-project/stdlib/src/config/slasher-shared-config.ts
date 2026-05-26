import { type ConfigMappingsType, numberConfigHelper } from '@aztec/foundation/config';

/** Shared across slasher and p2p (missing-tx collection deadline is clamped to this window). */
export interface SlashDataWithholdingToleranceSlotsConfig {
  /**
   * Number of full L2 slots that must elapse after a checkpoint's slot before declaring its txs
   * missing for data withholding. With tolerance = N and checkpoint slot S, the slash check fires
   * at the start of slot `S + N + 1`.
   */
  slashDataWithholdingToleranceSlots: number;
}

export const slashDataWithholdingToleranceSlotsConfigMappings: ConfigMappingsType<SlashDataWithholdingToleranceSlotsConfig> =
  {
    slashDataWithholdingToleranceSlots: {
      env: 'SLASH_DATA_WITHHOLDING_TOLERANCE_SLOTS',
      description:
        'Number of full L2 slots that must elapse after a checkpoint slot before declaring its txs missing for data withholding. Drives the slasher check and the P2P missing-tx collection deadline (clamped).',
      ...numberConfigHelper(3),
    },
  };
