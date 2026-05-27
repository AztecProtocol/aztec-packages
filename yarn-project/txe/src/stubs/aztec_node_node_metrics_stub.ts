// Stub for `aztec-node/dest/aztec-node/node_metrics.js`. The real `NodeMetrics` constructor
// pulls in the 66 KiB `@aztec/telemetry-client/metrics` module (the metric-name registry)
// via static imports of `Metrics.NODE_*` and `Attributes.*` constants — none of which the
// TXE worker records, because its `AztecNodeService` instance never reaches the receiveTx
// / snapshot paths. We provide a no-op class with the same call surface that the rest of
// `server.js` invokes.
/* eslint-disable @typescript-eslint/no-unused-vars */

export class NodeMetrics {
  constructor(_client: unknown, _name?: string) {}
  receivedTx(_durationMs: number, _isAccepted: boolean): void {}
  recordSnapshot(_durationMs: number): void {}
  recordSnapshotError(): void {}
}
