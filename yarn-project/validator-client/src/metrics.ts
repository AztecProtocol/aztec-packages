import type { BlockProposal } from '@aztec/stdlib/p2p';
import {
  Attributes,
  type Gauge,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
} from '@aztec/telemetry-client';

export class ValidatorMetrics {
  private failedReexecutionCounter: UpDownCounter;
  private successfulAttestationsCount: UpDownCounter;
  private failedAttestationsBadProposalCount: UpDownCounter;
  private failedAttestationsNodeIssueCount: UpDownCounter;

  private reexMana: Histogram;
  private reexTx: Histogram;
  private reexDuration: Gauge;

  constructor(telemetryClient: TelemetryClient) {
    const meter = telemetryClient.getMeter('Validator');

    this.failedReexecutionCounter = meter.createUpDownCounter(Metrics.VALIDATOR_FAILED_REEXECUTION_COUNT);

    this.successfulAttestationsCount = meter.createUpDownCounter(Metrics.VALIDATOR_ATTESTATION_SUCCESS_COUNT);

    this.failedAttestationsBadProposalCount = meter.createUpDownCounter(
      Metrics.VALIDATOR_ATTESTATION_FAILED_BAD_PROPOSAL_COUNT,
    );

    this.failedAttestationsNodeIssueCount = meter.createUpDownCounter(
      Metrics.VALIDATOR_ATTESTATION_FAILED_NODE_ISSUE_COUNT,
    );

    this.reexMana = meter.createHistogram(Metrics.VALIDATOR_RE_EXECUTION_MANA);

    this.reexTx = meter.createHistogram(Metrics.VALIDATOR_RE_EXECUTION_TX_COUNT);

    this.reexDuration = meter.createGauge(Metrics.VALIDATOR_RE_EXECUTION_TIME);
  }

  public recordReex(time: number, txs: number, mManaTotal: number) {
    this.reexDuration.record(Math.ceil(time));
    this.reexTx.record(txs);
    this.reexMana.record(mManaTotal);
  }

  public recordFailedReexecution(proposal: BlockProposal) {
    const proposer = proposal.getSender();
    this.failedReexecutionCounter.add(1, {
      [Attributes.STATUS]: 'failed',
      [Attributes.BLOCK_PROPOSER]: proposer?.toString() ?? 'unknown',
    });
  }

  public incSuccessfulAttestations(num: number) {
    this.successfulAttestationsCount.add(num);
  }

  public incFailedAttestationsBadProposal(num: number, reason: string, inCommittee: boolean) {
    this.failedAttestationsBadProposalCount.add(num, {
      [Attributes.ERROR_TYPE]: reason,
      [Attributes.IS_COMMITTEE_MEMBER]: inCommittee,
    });
  }

  public incFailedAttestationsNodeIssue(num: number, reason: string, inCommittee: boolean) {
    this.failedAttestationsNodeIssueCount.add(num, {
      [Attributes.ERROR_TYPE]: reason,
      [Attributes.IS_COMMITTEE_MEMBER]: inCommittee,
    });
  }
}
