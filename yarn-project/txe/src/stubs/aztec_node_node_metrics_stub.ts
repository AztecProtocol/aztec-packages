/* eslint-disable @typescript-eslint/no-unused-vars */

export class NodeMetrics {
  constructor(_client: unknown, _name?: string) {}
  receivedTx(_durationMs: number, _isAccepted: boolean): void {}
  recordSnapshot(_durationMs: number): void {}
  recordSnapshotError(): void {}
}
