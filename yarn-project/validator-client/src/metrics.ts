import type { BlockProposal } from '@aztec/stdlib/p2p';
import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

export class ValidatorMetrics {
  private failedReexecutionCounter: UpDownCounter;
  private attestationsCount: UpDownCounter;
  private failedAttestationsCount: UpDownCounter;

  private reexMana: Histogram;
  private reexTx: Histogram;
  private reexDuration: Histogram;

  constructor(telemetryClient: TelemetryClient) {
    const meter = telemetryClient.getMeter('Validator');

    this.failedReexecutionCounter = meter.createUpDownCounter(Metrics.VALIDATOR_FAILED_REEXECUTION_COUNT, {
      description: 'The number of failed re-executions',
      unit: 'count',
      valueType: ValueType.INT,
    });

    this.attestationsCount = meter.createUpDownCounter(Metrics.VALIDATOR_ATTESTATION_COUNT, {
      description: 'The number of attestations',
      valueType: ValueType.INT,
    });

    this.failedAttestationsCount = meter.createUpDownCounter(Metrics.VALIDATOR_FAILED_ATTESTATION_COUNT, {
      description: 'The number of failed attestations',
      valueType: ValueType.INT,
    });

    this.reexMana = meter.createHistogram(Metrics.VALIDATOR_RE_EXECUTION_MANA, {
      description: 'The mana consumed by blocks',
      valueType: ValueType.DOUBLE,
      unit: 'Mmana',
    });

    this.reexTx = meter.createHistogram(Metrics.VALIDATOR_RE_EXECUTION_TX_COUNT, {
      description: 'The number of txs in a block proposal',
      valueType: ValueType.INT,
      unit: 'tx',
    });

    this.reexDuration = meter.createGauge(Metrics.VALIDATOR_RE_EXECUTION_TIME, {
      description: 'The time taken to re-execute a transaction',
      unit: 'ms',
      valueType: ValueType.INT,
    });
  }

  public recordReex(time: number, txs: number, mManaTotal: number) {
    this.reexDuration.record(Math.ceil(time));
    this.reexTx.record(txs);
    this.reexMana.record(mManaTotal);
  }

  public recordFailedReexecution(proposal: BlockProposal) {
    this.failedReexecutionCounter.add(1, {
      [Attributes.STATUS]: 'failed',
      [Attributes.BLOCK_PROPOSER]: proposal.getSender().toString(),
    });
  }

  public incAttestations(num: number) {
    this.attestationsCount.add(num);
  }

  public incFailedAttestations(num: number, reason: string) {
    this.failedAttestationsCount.add(num, {
      [Attributes.ERROR_TYPE]: reason,
    });
  }
}
