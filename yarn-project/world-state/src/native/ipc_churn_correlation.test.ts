import { Fr } from '@aztec/foundation/curves/bn254';
import { type IpcClientAsync, UdsIpcClient, createNapiShmAsyncClient } from '@aztec/ipc-runtime';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { AsyncApi } from '@aztec/wsdb';

import { jest } from '@jest/globals';

import { NativeWorldStateService } from './native_world_state.js';

// Load tests for the wsdb IPC response-correlation invariant: every response a client resolves must
// be the response to ITS OWN request. The TS client correlates positionally (no request IDs), so any
// server-side misordering — reactor reorder stash, per-fork scheduler, or slot reuse across
// disconnects — surfaces here as a caller receiving another caller's payload.
//
// Detection design: connections must never share observable state, or a cross-connection swap of
// same-type responses is invisible (identical requests have identical answers). Each connection
// plants a private fork with leaves derived from its own seed, so ANY frame delivered to the wrong
// connection produces a visibly wrong value — wrong index, wrong root, wrong size — not just a
// wrong-type decode.
//
// Legs:
//   C: single connection, sequential (sanity — must always pass).
//   A: single connection, heavy pipelined contention (per-fork write serialisation → out-of-order
//      completions feed the reorder stash) — models the long-lived world-state client.
//   D: multi-connection read/write soak, NO connection churn. Readers verify recorded roots and
//      exact leaf indices on their private forks; writers pipeline append→read-after-write with
//      exact-index asserts. Independent of the disconnect-cleanup fixes — any failure here is a
//      distinct IPC/reorder/scheduler bug.
//   B: leg D's workload plus mid-flight churn — clients destroyed with calls in flight and
//      replaced, recycling server slots. Guards the reactor's disconnect cleanup and the server's
//      survival of mid-flight death.
//
// WSDB_SOAK_MS extends the D/B legs for grinding sessions (default a few seconds for CI).

const SOAK_MS = Number(process.env.WSDB_SOAK_MS ?? 4_000);
jest.setTimeout(Math.max(300_000, SOAK_MS * 4));

const TRANSPORT = (process.env.WSDB_TRANSPORT === 'shm' ? 'shm' : 'uds') as 'shm' | 'uds';
// Typed as plain number: the generated AsyncApi carries tree ids as numbers, so enum-typed
// comparisons against response fields trip no-unsafe-enum-comparison.
const TREE: number = MerkleTreeId.NOTE_HASH_TREE;
const N = 64;
/** Private leaves planted per connection identity. */
const M = 32;

/** Per-connection private state: a fork only this logical client touches. */
interface ConnIdentity {
  forkId: number;
  rev: { forkId: number; blockNumber: number; includeUncommitted: boolean };
  /** Leaves unique to this identity (and disjoint from every other identity and the seed fork). */
  leaves: Uint8Array[];
  /** Tree size before this identity's leaves were appended — leaf i lives at baseSize + i. */
  baseSize: number;
  /** Tree size including all writes so far (advanced by writer rounds). */
  size: number;
  /** Root recorded after planting; stable until the identity writes again. */
  root: Uint8Array;
}

/** Unique leaf value: disjoint across identities, write rounds, and the shared seed fork. */
const identityLeaf = (seed: number, i: number): Uint8Array =>
  new Fr((BigInt(0xc0ffee) << 64n) + (BigInt(seed) << 32n) + BigInt(i) + 1n).toBuffer();

/** Progress line every ~15s so long soaks show liveness and rate instead of going dark. */
const makeHeartbeat = (leg: string) => {
  const start = Date.now();
  let lastLog = start;
  return (rounds: number) => {
    const now = Date.now();
    if (now - lastLog >= 15_000) {
      lastLog = now;
      const elapsedS = (now - start) / 1000;
      // eslint-disable-next-line no-console
      console.log(
        `[soak ${leg}] ${new Date(now).toISOString()} rounds=${rounds} ` +
          `elapsed=${elapsedS.toFixed(0)}s rate=${(rounds / elapsedS).toFixed(1)}/s`,
      );
    }
  };
};

describe(`wsdb IPC churn/contention correlation (transport=${TRANSPORT})`, () => {
  let ws: NativeWorldStateService;
  let ipcPath: string | undefined;
  let leaves: Fr[];
  // The generated AsyncApi is bytes-in/bytes-out (wire `Fr = Uint8Array`); the facade normally
  // converts, but these tests drive AsyncApi directly, so pass raw 32-byte buffers.
  let leafBytes: Uint8Array[];
  /** A shared fork seeded with `leaves`; read with includeUncommitted. */
  let seedForkId: number;
  let seedRevision: { forkId: number; blockNumber: number; includeUncommitted: boolean };

  const makeClient = async (clientId: number): Promise<{ api: AsyncApi; backend: IpcClientAsync }> => {
    const backend: IpcClientAsync =
      TRANSPORT === 'shm'
        ? createNapiShmAsyncClient(ipcPath!.replace(/\.shm$/, ''), { clientId })
        : await UdsIpcClient.connect(ipcPath!, { connectTimeoutMs: 5_000 });
    return { api: new AsyncApi(backend), backend };
  };

  /** Create a private fork and plant this identity's unique leaves, recording size and root. */
  const plantIdentity = async (api: AsyncApi, seed: number): Promise<ConnIdentity> => {
    const forkId = (await api.createFork({ latest: true, blockNumber: 0 })).forkId;
    const rev = { forkId, blockNumber: 0xffffffff, includeUncommitted: true };
    const before = await api.getTreeInfo({ treeId: TREE, revision: rev });
    const baseSize = Number(before.size);
    const idLeaves = Array.from({ length: M }, (_, i) => identityLeaf(seed, i));
    await api.appendLeaves({ treeId: TREE, leaves: idLeaves, forkId });
    const after = await api.getTreeInfo({ treeId: TREE, revision: rev });
    if (Number(after.size) !== baseSize + M) {
      throw new Error(`plant(seed=${seed}): size ${after.size} != ${baseSize + M}`);
    }
    return { forkId, rev, leaves: idLeaves, baseSize, size: baseSize + M, root: after.root };
  };

  /**
   * Pipelined reads whose responses each prove they belong to this identity's own requests: exact
   * leaf indices on the private fork, and (when the identity has not written since planting) the
   * recorded root. A frame swapped from any other connection fails these by value.
   */
  const identityChecks = (api: AsyncApi, id: ConnIdentity, tag: string, opts?: { checkRoot?: boolean }) => {
    const checks: Promise<void>[] = [];
    for (let i = 0; i < M; i++) {
      const expectIdx = id.baseSize + i;
      checks.push(
        api.findLeafIndices({ treeId: TREE, revision: id.rev, leaves: [id.leaves[i]], startIndex: 0 }).then(r => {
          const got = r.indices?.[0];
          if (got === null || got === undefined || Number(got) !== expectIdx) {
            throw new Error(`${tag}: findLeafIndices(own leaf ${i}) returned ${String(got)}, expected ${expectIdx}`);
          }
        }),
      );
      checks.push(
        api.getSiblingPath({ treeId: TREE, revision: id.rev, leafIndex: expectIdx }).then(r => {
          if (!Array.isArray(r.path) || r.path.length === 0) {
            throw new Error(`${tag}: getSiblingPath(${expectIdx}) returned empty/invalid path`);
          }
        }),
      );
      checks.push(
        api.getTreeInfo({ treeId: TREE, revision: id.rev }).then(r => {
          if (r.treeId !== TREE || Number(r.size) < id.baseSize + M) {
            throw new Error(`${tag}: getTreeInfo returned treeId=${r.treeId} size=${r.size} (min ${id.baseSize + M})`);
          }
          if (opts?.checkRoot && Buffer.compare(r.root, id.root) !== 0) {
            throw new Error(`${tag}: getTreeInfo root mismatch — response belongs to another fork/connection`);
          }
        }),
      );
      checks.push(
        api.getStateReference({ revision: id.rev }).then(r => {
          if (!Array.isArray(r.state) || r.state.length === 0 || r.state.some(t => t.size === undefined)) {
            throw new Error(`${tag}: getStateReference malformed: ${JSON.stringify(r).slice(0, 160)}`);
          }
        }),
      );
    }
    return checks;
  };

  /**
   * One writer round: pipeline an append of a fresh unique leaf and, behind it on the same
   * connection, a read of that leaf — the per-fork scheduler must order the read after the write,
   * and the leaf must land at exactly the pre-append size. Also refreshes the identity's root.
   */
  const writerRound = async (api: AsyncApi, id: ConnIdentity, seed: number, round: number, tag: string) => {
    const leaf = identityLeaf(seed, M + round);
    const expectIdx = id.size;
    await Promise.all([
      api.appendLeaves({ treeId: TREE, leaves: [leaf], forkId: id.forkId }),
      api.findLeafIndices({ treeId: TREE, revision: id.rev, leaves: [leaf], startIndex: 0 }).then(r => {
        const got = r.indices?.[0];
        if (got === null || got === undefined || Number(got) !== expectIdx) {
          throw new Error(
            `${tag}: read-after-write of round-${round} leaf returned ${String(got)}, expected ${expectIdx}`,
          );
        }
      }),
      ...identityChecks(api, id, tag),
    ]);
    id.size++;
    id.root = (await api.getTreeInfo({ treeId: TREE, revision: id.rev })).root;
  };

  beforeAll(async () => {
    ws = await NativeWorldStateService.tmp();
    try {
      ipcPath = ws.getIpcPath();
    } catch {
      ipcPath = undefined; // in-process build — no IPC to exercise
      return;
    }
    leaves = Array.from({ length: N }, (_, i) => new Fr(BigInt(i) * 0x1_0000_0001n + 1n));
    leafBytes = leaves.map(l => l.toBuffer());

    // Seed a shared fork (forks are shared world-state objects, not per-connection). Legs A/C use
    // it; the multi-connection legs deliberately do NOT — see the detection-design note above.
    const seeder = await makeClient(1);
    try {
      seedForkId = (await seeder.api.createFork({ latest: true, blockNumber: 0 })).forkId;
      seedRevision = { forkId: seedForkId, blockNumber: 0xffffffff, includeUncommitted: true };
      await seeder.api.appendLeaves({ treeId: TREE, leaves: leafBytes, forkId: seedForkId });
      // Sanity: the seeded state must be readable exactly as planted, or every later check is void.
      const probe = await seeder.api.findLeafIndices({
        treeId: TREE,
        revision: seedRevision,
        leaves: [leafBytes[5]],
        startIndex: 0,
      });
      if (Number(probe.indices?.[0]) !== 5) {
        throw new Error(`seed verification failed: ${JSON.stringify(probe)}`);
      }
    } finally {
      await seeder.backend.destroy();
    }
  });

  afterAll(async () => {
    await ws?.close();
  });

  // Shared-fork variant used by the single-connection legs (no cross-connection ambiguity there).
  const selfCheckingReads = (api: AsyncApi, tag: string): Promise<void>[] => {
    const checks: Promise<void>[] = [];
    for (let i = 0; i < N; i++) {
      checks.push(
        api.getTreeInfo({ treeId: TREE, revision: seedRevision }).then(r => {
          if (r.treeId !== TREE) {
            throw new Error(`${tag}: getTreeInfo returned treeId=${r.treeId}, expected ${TREE}`);
          }
        }),
      );
      checks.push(
        api.getStateReference({ revision: seedRevision }).then(r => {
          if (!Array.isArray(r.state) || r.state.length === 0 || r.state.some(t => t.size === undefined)) {
            throw new Error(`${tag}: getStateReference malformed: ${JSON.stringify(r).slice(0, 160)}`);
          }
        }),
      );
      const idx = i;
      checks.push(
        api.getSiblingPath({ treeId: TREE, revision: seedRevision, leafIndex: idx }).then(r => {
          if (!Array.isArray(r.path) || r.path.length === 0) {
            throw new Error(`${tag}: getSiblingPath(index=${idx}) returned empty/invalid path`);
          }
        }),
      );
      checks.push(
        api.findLeafIndices({ treeId: TREE, revision: seedRevision, leaves: [leafBytes[i]], startIndex: 0 }).then(r => {
          const got = r.indices?.[0];
          if (got === null || got === undefined || Number(got) !== i) {
            throw new Error(`${tag}: findLeafIndices(leaf ${i}) returned index ${String(got)}, expected ${i}`);
          }
        }),
      );
    }
    return checks;
  };

  it('Leg C — single connection, sequential (sanity)', async () => {
    if (!ipcPath) {
      return;
    }
    const { api, backend } = await makeClient(1);
    try {
      for (let iter = 0; iter < 40; iter++) {
        const idx = iter % N;
        const r = await api.findLeafIndices({
          treeId: TREE,
          revision: seedRevision,
          leaves: [leafBytes[idx]],
          startIndex: 0,
        });
        const got = r.indices?.[0];
        if (got === null || got === undefined || Number(got) !== idx) {
          throw new Error(`Leg C: findLeafIndices(${idx}) returned ${String(got)}`);
        }
      }
    } finally {
      await backend.destroy();
    }
  });

  it('Leg A — single connection, contended pipeline (writes + reads interleaved)', async () => {
    if (!ipcPath) {
      return;
    }
    const { api, backend } = await makeClient(1);
    try {
      // Private scratch fork for writes: uncommitted reads on it queue behind each write, driving
      // the per-fork scheduler out of arrival order on this single connection. Reads of the seed
      // fork run concurrently (different fork), stacking more reorder pressure.
      const scratchForkId = (await api.createFork({ latest: true, blockNumber: 0 })).forkId;
      const scratchRev = { forkId: scratchForkId, blockNumber: 0xffffffff, includeUncommitted: true };
      for (let iter = 0; iter < 25; iter++) {
        const inflight: Promise<unknown>[] = [...selfCheckingReads(api, `A/iter${iter}`)];
        for (let w = 0; w < 8; w++) {
          const extra = [new Fr(BigInt(0x5eed_0000) + BigInt(iter * 100 + w)).toBuffer()];
          inflight.push(api.appendLeaves({ treeId: TREE, leaves: extra, forkId: scratchForkId }));
          inflight.push(
            api.getTreeInfo({ treeId: TREE, revision: scratchRev }).then(r => {
              if (r.treeId !== TREE) {
                throw new Error(`A/iter${iter}: scratch getTreeInfo returned treeId=${r.treeId}`);
              }
            }),
          );
        }
        await Promise.all(inflight);
      }
    } finally {
      await backend.destroy();
    }
  });

  it('Leg D — multi-connection read/write soak, no churn', async () => {
    if (!ipcPath) {
      return;
    }
    const READERS = 3;
    const WRITERS = 3;
    const conns = await Promise.all(Array.from({ length: READERS + WRITERS }, (_, i) => makeClient(i + 1)));
    try {
      // Distinct identity per connection; readers keep theirs immutable so roots stay checkable.
      const ids = [];
      for (let c = 0; c < conns.length; c++) {
        ids.push(await plantIdentity(conns[c].api, 100 + c));
      }

      const deadline = Date.now() + SOAK_MS;
      const heartbeat = makeHeartbeat('D');
      let round = 0;
      do {
        const inflight: Promise<unknown>[] = [];
        for (let c = 0; c < READERS; c++) {
          inflight.push(
            Promise.all(identityChecks(conns[c].api, ids[c], `D/round${round}/reader${c}`, { checkRoot: true })),
          );
        }
        for (let c = READERS; c < conns.length; c++) {
          inflight.push(writerRound(conns[c].api, ids[c], 100 + c, round, `D/round${round}/writer${c}`));
        }
        // Fail fast: the first mispaired/malformed response aborts the soak with its tag.
        await Promise.all(inflight);
        round++;
        heartbeat(round);
      } while (Date.now() < deadline);
      expect(round).toBeGreaterThan(0);
    } finally {
      await Promise.all(conns.map(({ backend }) => backend.destroy().catch(() => {})));
    }
  });

  it('Leg B — churned multi-connection workload (slot recycling)', async () => {
    if (!ipcPath) {
      return;
    }
    const CONNS = 6;
    const clients = await Promise.all(Array.from({ length: CONNS }, (_, i) => makeClient(i + 1)));
    const ids: ConnIdentity[] = [];
    for (let c = 0; c < CONNS; c++) {
      ids.push(await plantIdentity(clients[c].api, 200 + c));
    }
    try {
      const deadline = Date.now() + SOAK_MS;
      const heartbeat = makeHeartbeat('B');
      let iter = 0;
      do {
        // Every connection pipelines identity-verified reads (one writer mixes in writes). Only
        // the round's victim may reject, and only with its own destroy error — anything else
        // (mispaired value, decode failure, another connection's socket dying) aborts the soak
        // immediately with its tag.
        const victim = iter % (CONNS - 1); // never the writer, so its size/root model stays valid
        const perConn = clients.map(({ api }, c) => {
          const tag = `B/iter${iter}/conn${c}`;
          const work =
            c === CONNS - 1
              ? writerRound(api, ids[c], 200 + c, iter, tag)
              : Promise.all(identityChecks(api, ids[c], tag)).then(() => undefined);
          return work.catch((e: Error) => {
            if (c === victim && /destroyed/.test(e.message)) {
              return; // the victim's own in-flight calls reject when we destroy it below
            }
            throw new Error(`${tag}: ${e.message}`);
          });
        });

        // Churn: while those are in flight, destroy the victim (leaving its requests in flight
        // server-side) and immediately replace it (reusing the freed server slot). The
        // replacement gets a fresh identity — its old fork stays behind, like a killed AVM sim's.
        await clients[victim].backend.destroy().catch(() => {});
        clients[victim] = await makeClient(victim + 1);

        await Promise.all(perConn);
        ids[victim] = await plantIdentity(clients[victim].api, 200 + CONNS + iter);
        iter++;
        heartbeat(iter);
      } while (Date.now() < deadline);
    } finally {
      await Promise.all(clients.map(({ backend }) => backend.destroy().catch(() => {})));
    }
  });
});
