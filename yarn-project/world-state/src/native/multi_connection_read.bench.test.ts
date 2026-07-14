import { createLogger } from '@aztec/foundation/log';
import { type IpcClientAsync, UdsIpcClient, createNapiShmAsyncClient } from '@aztec/ipc-runtime';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { AsyncApi } from '@aztec/wsdb';

import { NativeWorldStateService } from './native_world_state.js';

/**
 * Multi-connection world-state read throughput (IPC only).
 *
 * Models the AVM proving topology: one aztec-wsdb process with N independent
 * client connections, each issuing SEQUENTIAL reads (a single in-flight request
 * at a time, like a synchronous bb-avm-sim). This differs from
 * parallel_read.bench.test.ts, which pipelines N in-flight reads down a SINGLE
 * connection — here the load is spread across N request/response rings, which is
 * what the simulator pool actually does.
 *
 * NOTE on comparing to in-process: this bench calls the generated AsyncApi
 * directly, bypassing the IpcWorldState + MerkleTreesFacade wrapper layers that
 * NativeWorldStateService (and therefore the in-process numbers in
 * parallel_read.bench) goes through. That wrapper adds ~40% overhead (compare the
 * 1-connection number here to parallel_read's concurrency=1), so these raw
 * figures are NOT directly comparable to in-process — they measure server
 * capability with a lean client. The apples-to-apples in-process comparison is
 * parallel_read.bench, where both sides share the facade.
 *
 * Skips on the in-process build (no IPC path). Run with LOG_LEVEL=info.
 */
describe('world-state multi-connection read throughput', () => {
  const logger = createLogger('bench:ws-multi-conn-read');
  const TOTAL_READS = 20_000;
  // Max 7 connections: this mirrors the production SHM ceiling. The server caps
  // SHM at max_shm_clients (8) ring-pairs; the TS world-state client holds one
  // (modeled here by NativeWorldStateService = client 0), leaving 7 for the AVM
  // simulator pool. (UDS has no such cap — it is backlog-bound — but we use the
  // same counts for a like-for-like transport comparison.)
  const CONNECTION_COUNTS = [1, 2, 4, 7];
  const TREE = MerkleTreeId.PUBLIC_DATA_TREE;
  // Committed snapshot — mirrors WorldStateRevision.empty() / LATEST.
  const COMMITTED = { forkId: 0, blockNumber: 0xffffffff, includeUncommitted: false };

  const transport = process.env.WSDB_TRANSPORT === 'shm' ? 'shm' : 'uds';

  let ws: NativeWorldStateService;
  let ipcPath: string | undefined;

  beforeAll(async () => {
    ws = await NativeWorldStateService.tmp();
    try {
      ipcPath = ws.getIpcPath();
    } catch {
      ipcPath = undefined; // in-process build — nothing to measure here
    }
  });

  afterAll(async () => {
    await ws.close();
  });

  const makeClient = async (clientId: number): Promise<{ api: AsyncApi; backend: IpcClientAsync }> => {
    let backend: IpcClientAsync;
    if (transport === 'shm') {
      backend = createNapiShmAsyncClient(ipcPath!.replace(/\.shm$/, ''), { clientId });
    } else {
      backend = await UdsIpcClient.connect(ipcPath!, { connectTimeoutMs: 5_000 });
    }
    return { api: new AsyncApi(backend), backend };
  };

  it('reports read throughput vs connection count', async () => {
    if (!ipcPath) {
      logger.info('skipping: in-process world state has no IPC connections');
      return;
    }

    const results: { connections: number; reads: number; ms: number; throughput: number }[] = [];

    for (const connections of CONNECTION_COUNTS) {
      // Bench connections use client ids 1..N (id 0 is the NativeWorldStateService's
      // own connection). Fresh connections each round so rings start empty.
      const clients = await Promise.all(Array.from({ length: connections }, (_, i) => makeClient(i + 1)));

      const perConn = Math.floor(TOTAL_READS / connections);
      const reads = perConn * connections;

      // One in-flight read at a time per connection (synchronous-sim model).
      const connectionWorker = async (connId: number, api: AsyncApi) => {
        for (let i = 0; i < perConn; i++) {
          await api.getSiblingPath({ treeId: TREE, revision: COMMITTED, leafIndex: (connId + i) % 64 });
        }
      };

      // Warm each connection (page-in, connect rings) before timing.
      await Promise.all(
        clients.map(({ api }) => api.getSiblingPath({ treeId: TREE, revision: COMMITTED, leafIndex: 0 })),
      );

      const start = performance.now();
      await Promise.all(clients.map(({ api }, c) => connectionWorker(c, api)));
      const ms = performance.now() - start;
      const throughput = reads / (ms / 1000);

      results.push({ connections, reads, ms, throughput });
      logger.info(
        `transport=${transport} connections=${connections} reads=${reads} ms=${ms.toFixed(1)} throughput=${throughput.toFixed(0)} reads/s`,
      );

      await Promise.all(clients.map(({ backend }) => backend.destroy()));
    }

    const base = results[0].throughput;
    for (const r of results) {
      logger.info(`connections=${r.connections} scaling=${(r.throughput / base).toFixed(2)}x vs 1 connection`);
    }
  }, 120_000);
});
