import type { BlockProposal } from '@aztec/stdlib/p2p';
import {
  Attributes,
  type Gauge,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

import type { BlockProposalValidationFailureReason } from './block_proposal_handler.js';

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

    this.failedReexecutionCounter = createUpDownCounterWithDefault(meter, Metrics.VALIDATOR_FAILED_REEXECUTION_COUNT, {
      [Attributes.STATUS]: ['failed'],
    });

    this.successfulAttestationsCount = createUpDownCounterWithDefault(
      meter,
      Metrics.VALIDATOR_ATTESTATION_SUCCESS_COUNT,
    );

    this.failedAttestationsBadProposalCount = createUpDownCounterWithDefault(
      meter,
      Metrics.VALIDATOR_ATTESTATION_FAILED_BAD_PROPOSAL_COUNT,
      {
        [Attributes.ERROR_TYPE]: [
          'invalid_proposal',
          'state_mismatch',
          'failed_txs',
          'in_hash_mismatch',
          'parent_block_wrong_slot',
        ],
        [Attributes.IS_COMMITTEE_MEMBER]: [true, false],
      },
    );

    this.failedAttestationsNodeIssueCount = createUpDownCounterWithDefault(
      meter,
      Metrics.VALIDATOR_ATTESTATION_FAILED_NODE_ISSUE_COUNT,
      {
        [Attributes.ERROR_TYPE]: [
          'parent_block_not_found',
          'global_variables_mismatch',
          'block_number_already_exists',
          'txs_not_available',
          'timeout',
          'unknown_error',
        ],
        [Attributes.IS_COMMITTEE_MEMBER]: [true, false],
      },
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

  public incFailedAttestationsBadProposal(
    num: number,
    reason: BlockProposalValidationFailureReason,
    inCommittee: boolean,
  ) {
    this.failedAttestationsBadProposalCount.add(num, {
      [Attributes.ERROR_TYPE]: reason,
      [Attributes.IS_COMMITTEE_MEMBER]: inCommittee,
    });
  }

  public incFailedAttestationsNodeIssue(
    num: number,
    reason: BlockProposalValidationFailureReason,
    inCommittee: boolean,
  ) {
    this.failedAttestationsNodeIssueCount.add(num, {
      [Attributes.ERROR_TYPE]: reason,
      [Attributes.IS_COMMITTEE_MEMBER]: inCommittee,
    });
  }
}
