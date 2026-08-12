import { Fr } from '@aztec/foundation/curves/bn254';
import { type IpcClientAsync, UdsIpcClient } from '@aztec/ipc-runtime';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { AsyncApi } from '@aztec/wsdb';

import { jest } from '@jest/globals';

import { NativeWorldStateService } from './native_world_state.js';

// The wsdb server must survive a client that disconnects with requests still in flight: the
// reactor drops the connection's late responses (their connection's reorder state is gone, and
// client ids are never reused) and any write that races the disconnect yields EPIPE, not a
// process-killing SIGPIPE. This is the cross-process guard for
// that invariant — an in-process C++ test cannot reliably raise SIGPIPE because the kernel may
// buffer writes to a just-closed local peer. A long-lived "monitor" connection (models the TS
// world-state client, which never disconnects) proves the blast radius: it must keep reading
// correct answers while an unrelated peer churns. Mid-flight client death is routine in
// production: AVM simulator processes are killed on cancellation and teardown while their wsdb
// requests are outstanding.

jest.setTimeout(120_000);
const TREE = MerkleTreeId.NOTE_HASH_TREE;

describe('wsdb server survives a mid-flight client disconnect', () => {
  let ws: NativeWorldStateService;
  let ipcPath: string | undefined;
  let seedRev: { forkId: number; blockNumber: number; includeUncommitted: boolean };
  let leafBytes: Uint8Array[];

  const connect = async (): Promise<{ api: AsyncApi; backend: IpcClientAsync }> => {
    const backend = await UdsIpcClient.connect(ipcPath!, { connectTimeoutMs: 5_000 });
    return { api: new AsyncApi(backend), backend };
  };

  beforeAll(async () => {
    ws = await NativeWorldStateService.tmp();
    try {
      ipcPath = ws.getIpcPath();
    } catch {
      ipcPath = undefined; // in-process build — no IPC to exercise
      return;
    }
    // The generated AsyncApi is bytes-in/bytes-out (wire `Fr = Uint8Array`), so pass raw buffers.
    leafBytes = Array.from({ length: 64 }, (_, i) => new Fr(BigInt(i) * 0x1_0000_0001n + 1n).toBuffer());
    const seeder = await connect();
    const forkId = (await seeder.api.createFork({ latest: true, blockNumber: 0 })).forkId;
    seedRev = { forkId, blockNumber: 0xffffffff, includeUncommitted: true };
    await seeder.api.appendLeaves({ treeId: TREE, leaves: leafBytes, forkId });
    await seeder.backend.destroy();
  });

  afterAll(async () => {
    await ws?.close();
  });

  it('a long-lived monitor keeps working after an unrelated client disconnects mid-flight', async () => {
    if (!ipcPath) {
      return;
    }
    const monitor = await connect();
    try {
      const before = await monitor.api.getStateReference({ revision: seedRev });
      expect(Array.isArray(before.state) && before.state.length > 0).toBe(true);

      // Victim pipelines many reads, then destroys its connection WITHOUT draining them. The
      // server completes them after the disconnect and must drop them cleanly.
      for (let round = 0; round < 20; round++) {
        const victim = await connect();
        for (let i = 0; i < 200; i++) {
          void victim.api.getStateReference({ revision: seedRev }).catch(() => {});
          void victim.api.getSiblingPath({ treeId: TREE, revision: seedRev, leafIndex: i % 64 }).catch(() => {});
        }
        await victim.backend.destroy(); // close mid-flight

        // The monitor must still get a correct answer; if the server died this read never
        // resolves (or the connection resets), and if a stale frame leaked the decode fails.
        const r = await monitor.api.getStateReference({ revision: seedRev });
        if (!Array.isArray(r.state) || r.state.length === 0) {
          throw new Error(`round ${round}: monitor read malformed after churn: ${JSON.stringify(r).slice(0, 160)}`);
        }
      }
    } finally {
      await monitor.backend.destroy().catch(() => {});
    }
  });
});
