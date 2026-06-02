import { throwStub } from './stub_helpers.js';

export class NodeMetrics {
  // The constructor runs whenever an AztecNodeService is built, so it must stay a no-op. The
  // recording methods below are only reached via sendTx / startSnapshotUpload, neither of which the
  // TXE node exercises, so they throw if ever called.
  constructor(_client: unknown, _name?: string) {}

  receivedTx(_durationMs: number, _isAccepted: boolean): void {
    throwStub('NodeMetrics.receivedTx');
  }

  recordSnapshot(_durationMs: number): void {
    throwStub('NodeMetrics.recordSnapshot');
  }

  recordSnapshotError(): void {
    throwStub('NodeMetrics.recordSnapshotError');
  }
}
