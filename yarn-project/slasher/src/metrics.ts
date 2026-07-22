import type { EthAddress } from '@aztec/foundation/eth-address';
import {
  Attributes,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

import { formatEther } from 'viem/utils';

export class SlasherMetrics {
  private readonly roundExecuted: UpDownCounter;
  private readonly ownValidatorTargeted: UpDownCounter;
  private readonly ownValidatorSlashedCount: UpDownCounter;
  private readonly ownValidatorSlashedAmount: UpDownCounter;

  constructor(client: TelemetryClient, ownValidators: EthAddress[] = [], name = 'Slasher') {
    const meter = client.getMeter(name);
    this.roundExecuted = createUpDownCounterWithDefault(meter, Metrics.SLASHER_ROUND_EXECUTED_COUNT);

    // Seed a zero-valued series per own validator so dashboards show the series before any slashing event;
    // an empty array seeds nothing for nodes that run no validators.
    const seedAttributes =
      ownValidators.length > 0 ? { [Attributes.ATTESTER_ADDRESS]: ownValidators.map(v => v.toString()) } : [];
    this.ownValidatorTargeted = createUpDownCounterWithDefault(
      meter,
      Metrics.SLASHER_OWN_VALIDATOR_TARGETED_COUNT,
      seedAttributes,
    );
    this.ownValidatorSlashedCount = createUpDownCounterWithDefault(
      meter,
      Metrics.SLASHER_OWN_VALIDATOR_SLASHED_COUNT,
      seedAttributes,
    );
    this.ownValidatorSlashedAmount = createUpDownCounterWithDefault(
      meter,
      Metrics.SLASHER_OWN_VALIDATOR_SLASHED_AMOUNT,
      seedAttributes,
    );
  }

  public recordRoundExecuted(): void {
    this.roundExecuted.add(1);
  }

  /** Records that an onchain slashing vote named one of the node's own validators as a target. */
  public recordOwnValidatorTargeted(validator: EthAddress): void {
    this.ownValidatorTargeted.add(1, { [Attributes.ATTESTER_ADDRESS]: validator.toString() });
  }

  /** Records an executed slash against one of the node's own validators. */
  public recordOwnValidatorSlashed(validator: EthAddress, amount: bigint): void {
    const attributes = { [Attributes.ATTESTER_ADDRESS]: validator.toString() };
    this.ownValidatorSlashedCount.add(1, attributes);
    this.ownValidatorSlashedAmount.add(parseFloat(formatEther(amount)), attributes);
  }
}
