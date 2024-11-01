

import { type UpDownCounter, type TelemetryClient, Metrics, WithTracer } from '@aztec/telemetry-client';

export class P2PMetrics extends WithTracer {
    private peerCount: UpDownCounter;

    constructor(client: TelemetryClient, name = 'P2P') {
        super(client, name);

        const meter = client.getMeter(name);

        this.peerCount = meter.createUpDownCounter(Metrics.P2P_PEER_COUNT, {
            description: "The number of active peers",
        });
    }

    recordAddPeer() {
        this.peerCount.add(1);
    }

    recordRemovePeer() {
        this.peerCount.add(-1);
    }
}