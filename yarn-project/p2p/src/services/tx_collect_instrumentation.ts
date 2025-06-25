import { Metrics, type TelemetryClient, type UpDownCounter } from '@aztec/telemetry-client';

export class TxCollectorInstrumentation {
  private txFromProposalCount: UpDownCounter;
  private txFromMempoolCount: UpDownCounter;
  private txFromP2PCount: UpDownCounter;
  private missingTxsCount: UpDownCounter;

  constructor(client: TelemetryClient, name: string) {
    const meter = client.getMeter(name);

    this.txFromProposalCount = meter.createUpDownCounter(Metrics.TX_COLLECTOR_TXS_FROM_PROPOSALS_COUNT, {
      description: 'The number of txs taken from block proposals',
    });

    this.txFromMempoolCount = meter.createUpDownCounter(Metrics.TX_COLLECTOR_TXS_FROM_MEMPOOL_COUNT, {
      description: 'The number of txs taken from the local mempool',
    });

    this.txFromP2PCount = meter.createUpDownCounter(Metrics.TX_COLLECTOR_TXS_FROM_P2P_COUNT, {
      description: 'The number of txs taken from the p2p network',
    });

    this.missingTxsCount = meter.createUpDownCounter(Metrics.TX_COLLECTOR_MISSING_TXS_COUNT, {
      description: 'The number of txs not found anywhere',
    });
  }

  incTxsFromProposals(count: number) {
    this.txFromProposalCount.add(count);
  }

  incTxsFromMempool(count: number) {
    this.txFromMempoolCount.add(count);
  }

  incTxsFromP2P(count: number) {
    this.txFromP2PCount.add(count);
  }

  incMissingTxs(count: number) {
    this.missingTxsCount.add(count);
  }
}
