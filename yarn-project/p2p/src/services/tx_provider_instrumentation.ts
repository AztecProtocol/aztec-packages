import { type Histogram, Metrics, type TelemetryClient, type UpDownCounter } from '@aztec/telemetry-client';

import { ValueType } from '@opentelemetry/api';

export class TxProviderInstrumentation {
  private txFromProposalCount: UpDownCounter;
  private txFromMempoolCount: UpDownCounter;
  private txFromP2PCount: UpDownCounter;
  private missingTxsCount: UpDownCounter;

  private fractionOfTxsRequestedFromP2P: Histogram;
  private txsRequestDelay: Histogram;

  constructor(client: TelemetryClient, name: string) {
    const meter = client.getMeter(name);

    this.txFromProposalCount = meter.createUpDownCounter(Metrics.TX_PROVIDER_TXS_FROM_PROPOSALS_COUNT, {
      description: 'The number of txs taken from block proposals',
    });

    this.txFromMempoolCount = meter.createUpDownCounter(Metrics.TX_PROVIDER_TXS_FROM_MEMPOOL_COUNT, {
      description: 'The number of txs taken from the local mempool',
    });

    this.txFromP2PCount = meter.createUpDownCounter(Metrics.TX_PROVIDER_TXS_FROM_P2P_COUNT, {
      description: 'The number of txs taken from the p2p network',
    });

    this.missingTxsCount = meter.createUpDownCounter(Metrics.TX_PROVIDER_MISSING_TXS_COUNT, {
      description: 'The number of txs not found anywhere',
    });

    this.fractionOfTxsRequestedFromP2P = meter.createHistogram(Metrics.TX_PROVIDER_P2P_TXS_REQUESTED_FRACTION, {
      description: 'The fraction of transaction requested from peers',
      valueType: ValueType.DOUBLE,
    });

    this.txsRequestDelay = meter.createHistogram(Metrics.TX_PROVIDER_P2P_TXS_REQUEST_DELAY, {
      unit: 'ms',
      description: 'The time it took to request missing transactions from p2p',
      valueType: ValueType.INT,
    });
  }

  incTxsFromProposals(count: number) {
    this.txFromProposalCount.add(count);
  }

  incTxsFromMempool(count: number) {
    this.txFromMempoolCount.add(count);
  }

  incTxsFromP2P(count: number, total: number) {
    this.txFromP2PCount.add(count);
    this.fractionOfTxsRequestedFromP2P.record(count / total);
  }

  recordTxsRequestDelay(delay: number) {
    this.txsRequestDelay.record(delay);
  }

  incMissingTxs(count: number) {
    this.missingTxsCount.add(count);
  }
}
