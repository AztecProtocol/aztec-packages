import {
  type Gauge,
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
  private readonly ownValidatorCurrentRoundVotesMax: Gauge;
  private readonly quorumSize: Gauge;

  constructor(client: TelemetryClient, name = 'Slasher') {
    const meter = client.getMeter(name);
    this.roundExecuted = createUpDownCounterWithDefault(meter, Metrics.SLASHER_ROUND_EXECUTED_COUNT);
    this.ownValidatorTargeted = createUpDownCounterWithDefault(meter, Metrics.SLASHER_OWN_VALIDATOR_TARGETED_COUNT);
    this.ownValidatorSlashedCount = createUpDownCounterWithDefault(meter, Metrics.SLASHER_OWN_VALIDATOR_SLASHED_COUNT);
    this.ownValidatorSlashedAmount = createUpDownCounterWithDefault(
      meter,
      Metrics.SLASHER_OWN_VALIDATOR_SLASHED_AMOUNT,
    );
    this.ownValidatorCurrentRoundVotesMax = meter.createGauge(Metrics.SLASHER_OWN_VALIDATOR_CURRENT_ROUND_VOTES_MAX);
    this.quorumSize = meter.createGauge(Metrics.SLASHER_QUORUM_SIZE);
  }

  public recordRoundExecuted(): void {
    this.roundExecuted.add(1);
  }

  /** Records the quorum a validator must reach in a round to be slashed, so dashboards can plot the threshold. */
  public recordQuorumSize(quorum: number): void {
    this.quorumSize.record(quorum);
  }

  /** Records that an onchain slashing vote named one of the node's own validators as a target. */
  public recordOwnValidatorTargeted(): void {
    this.ownValidatorTargeted.add(1);
  }

  /**
   * Records how close the most-voted committee position held by the node's own validators is to quorum this round.
   * Recorded as an absolute value rather than a delta so a vote seen across a round rollover cannot make it drift.
   */
  public recordCurrentRoundVotesMax(votes: number): void {
    this.ownValidatorCurrentRoundVotesMax.record(votes);
  }

  /** Records an executed slash against one of the node's own validators. */
  public recordOwnValidatorSlashed(amount: bigint): void {
    this.ownValidatorSlashedCount.add(1);
    this.ownValidatorSlashedAmount.add(parseFloat(formatEther(amount)));
  }
}
