import type { IL1TxMetrics, L1TxState } from '@aztec/ethereum';
import { TxUtilsState } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import {
  Attributes,
  type Histogram,
  type Meter,
  Metrics,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

export type L1TxScope = 'sequencer' | 'prover' | 'other';

/**
 * Metrics for L1 transaction utils tracking tx lifecycle and gas costs.
 */
export class L1TxMetrics implements IL1TxMetrics {
  // Time until tx is mined
  private txMinedDuration: Histogram;

  // Number of attempts until mined
  private txAttemptsUntilMined: Histogram;

  // Counters for end states
  private txMinedCount: UpDownCounter;
  private txRevertedCount: UpDownCounter;
  private txCancelledCount: UpDownCounter;
  private txNotMinedCount: UpDownCounter;

  // Gas price histograms (at end state, in wei)
  private maxPriorityFeeHistogram: Histogram;
  private maxFeeHistogram: Histogram;
  private blobFeeHistogram: Histogram;

  constructor(
    private meter: Meter,
    private scope: L1TxScope = 'other',
    private logger = createLogger('l1-tx-utils:metrics'),
  ) {
    this.txMinedDuration = this.meter.createHistogram(Metrics.L1_TX_MINED_DURATION, {
      description: 'Time from initial tx send until mined',
      unit: 's',
      valueType: ValueType.INT,
    });

    this.txAttemptsUntilMined = this.meter.createHistogram(Metrics.L1_TX_ATTEMPTS_UNTIL_MINED, {
      description: 'Number of tx attempts (including speed-ups) until mined',
      unit: 'attempts',
      valueType: ValueType.INT,
    });

    this.txMinedCount = this.meter.createUpDownCounter(Metrics.L1_TX_MINED_COUNT, {
      description: 'Count of transactions successfully mined',
      valueType: ValueType.INT,
    });

    this.txRevertedCount = this.meter.createUpDownCounter(Metrics.L1_TX_REVERTED_COUNT, {
      description: 'Count of transactions that reverted',
      valueType: ValueType.INT,
    });

    this.txCancelledCount = this.meter.createUpDownCounter(Metrics.L1_TX_CANCELLED_COUNT, {
      description: 'Count of transactions cancelled',
      valueType: ValueType.INT,
    });

    this.txNotMinedCount = this.meter.createUpDownCounter(Metrics.L1_TX_NOT_MINED_COUNT, {
      description: 'Count of transactions not mined (timed out)',
      valueType: ValueType.INT,
    });

    this.maxPriorityFeeHistogram = this.meter.createHistogram(Metrics.L1_TX_MAX_PRIORITY_FEE, {
      description: 'Max priority fee per gas at tx end state (in wei)',
      unit: 'wei',
      valueType: ValueType.INT,
    });

    this.maxFeeHistogram = this.meter.createHistogram(Metrics.L1_TX_MAX_FEE, {
      description: 'Max fee per gas at tx end state (in wei)',
      unit: 'wei',
      valueType: ValueType.INT,
    });

    this.blobFeeHistogram = this.meter.createHistogram(Metrics.L1_TX_BLOB_FEE, {
      description: 'Max fee per blob gas at tx end state (in wei)',
      unit: 'wei',
      valueType: ValueType.INT,
    });
  }

  /**
   * Records metrics when a transaction is mined.
   * @param state - The L1 transaction state
   * @param l1Timestamp - The current L1 timestamp
   */
  public recordMinedTx(state: L1TxState, l1Timestamp: Date): void {
    if (state.status !== TxUtilsState.MINED) {
      this.logger.warn(
        `Attempted to record mined tx metrics for a tx not in MINED state (state: ${TxUtilsState[state.status]})`,
        { scope: this.scope, nonce: state.nonce },
      );
      return;
    }

    const attributes = { [Attributes.L1_TX_SCOPE]: this.scope };
    const isCancelTx = state.cancelTxHashes.length > 0;
    const isReverted = state.receipt?.status === 'reverted';

    if (isCancelTx) {
      this.txCancelledCount.add(1, attributes);
    } else if (isReverted) {
      this.txRevertedCount.add(1, attributes);
    } else {
      this.txMinedCount.add(1, attributes);
    }

    // Record time to mine using provided L1 timestamp
    const duration = Math.floor((l1Timestamp.getTime() - state.sentAtL1Ts.getTime()) / 1000);
    this.txMinedDuration.record(duration, attributes);

    // Record number of attempts until mined
    const attempts = isCancelTx ? state.cancelTxHashes.length : state.txHashes.length;
    this.txAttemptsUntilMined.record(attempts, attributes);

    // Record gas prices at end state (in wei as integers)
    const maxPriorityFeeWei = Number(state.gasPrice.maxPriorityFeePerGas);
    const maxFeeWei = Number(state.gasPrice.maxFeePerGas);
    const blobFeeWei = state.gasPrice.maxFeePerBlobGas ? Number(state.gasPrice.maxFeePerBlobGas) : undefined;

    this.maxPriorityFeeHistogram.record(maxPriorityFeeWei, attributes);
    this.maxFeeHistogram.record(maxFeeWei, attributes);

    // Record blob fee if present (in wei as integer)
    if (blobFeeWei !== undefined) {
      this.blobFeeHistogram.record(blobFeeWei, attributes);
    }

    this.logger.debug(`Recorded tx end state metrics`, {
      status: TxUtilsState[state.status],
      nonce: state.nonce,
      isCancelTx,
      isReverted,
      scope: this.scope,
      maxPriorityFeeWei,
      maxFeeWei,
      blobFeeWei,
    });
  }

  public recordDroppedTx(state: L1TxState): void {
    if (state.status !== TxUtilsState.NOT_MINED) {
      this.logger.warn(
        `Attempted to record dropped tx metrics for a tx not in NOT_MINED state (state: ${TxUtilsState[state.status]})`,
        { scope: this.scope, nonce: state.nonce },
      );
      return;
    }

    const attributes = { [Attributes.L1_TX_SCOPE]: this.scope };
    this.txNotMinedCount.add(1, attributes);

    this.logger.debug(`Recorded tx dropped metrics`, {
      status: TxUtilsState[state.status],
      nonce: state.nonce,
      scope: this.scope,
    });
  }
}
