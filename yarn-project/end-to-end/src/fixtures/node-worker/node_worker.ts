import type { EnvVar } from '@aztec/foundation/config';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { ApiSchema } from '@aztec/foundation/schemas';
import { sleep } from '@aztec/foundation/sleep';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { NodeConnector, TransportClient } from '@aztec/foundation/transport';
import type { AztecNode, AztecNodeAdmin, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';
import type { GenesisData } from '@aztec/stdlib/world-state';

import { MessageChannel, type MessagePort, Worker } from 'worker_threads';

import type { DateProviderBridge } from './date_provider_bridge.js';
import { NodeWorkerSchema } from './node_worker_schema.js';

type WorkerMsg = { fn: string; args: string };

/** Options for {@link NodeWorker.create}. */
export type NodeWorkerOptions = {
  /** Env bag consumed by the worker's `getConfigFromMappings(aztecNodeConfigMappings, env)` call. */
  env: Partial<Record<EnvVar, string>>;
  /** Genesis data (prefilled public state + timestamp). Serialized over the boundary. */
  genesis?: GenesisData;
  /** Authoritative date provider on the main thread. Its mutations are mirrored to the worker. */
  dateProvider: TestDateProvider;
  /** Bridge that fans `setTime`/`advanceTime`/`reset` out to all worker ports. */
  dateProviderBridge: DateProviderBridge;
  /** When true, the sequencer subsystem is created but not started. */
  dontStartSequencer?: boolean;
  /** When true, the prover-node subsystem is created but not started. */
  dontStartProverNode?: boolean;
  /** Optional actor label for worker logs (e.g. `node-0`, `prover-0`). */
  actor?: string;
};

const log = createLogger('e2e:node-worker');

const WORKER_READY_TIMEOUT_MS = 180_000;

/**
 * Spawns an {@link AztecNodeService} in a worker thread and exposes a JSON-RPC proxy to it.
 * The proxy's typed surface is `AztecNode & AztecNodeAdmin & AztecNodeDebug`; every method call
 * is marshalled through a {@link TransportClient}.
 *
 * Main-thread event-loop activity never delays the node's slot timer — that's the whole point.
 */
export class NodeWorker {
  private readonly proxy: AztecNode & AztecNodeAdmin & AztecNodeDebug;

  private constructor(
    private readonly worker: Worker,
    private readonly transport: TransportClient<WorkerMsg>,
    private readonly mainPort: MessagePort,
    private readonly bridge: DateProviderBridge,
  ) {
    this.proxy = new Proxy({} as any, {
      get: (_target, method: string | symbol) => {
        if (typeof method !== 'string') {
          return undefined;
        }
        const schema = (NodeWorkerSchema as ApiSchema)[method];
        if (!schema) {
          return undefined;
        }
        return async (...args: any[]) => {
          const resultJson = (await this.transport.request({ fn: method, args: jsonStringify(args) })) as
            | string
            | undefined;
          // `jsonStringify(undefined)` returns `undefined`, so void-returning methods arrive as
          // undefined here. Hand it straight to the schema so `z.void()` validates successfully.
          const parsed = resultJson === undefined ? undefined : JSON.parse(resultJson);
          return schema.returnType().parseAsync(parsed);
        };
      },
    }) as AztecNode & AztecNodeAdmin & AztecNodeDebug;
  }

  /** Spawns the worker, opens the transport, and waits for the node to be ready. */
  public static async create(opts: NodeWorkerOptions): Promise<NodeWorker> {
    const workerUrl = new URL('./node_worker_script.js', import.meta.url);
    // Jest runs from src/; the compiled worker script lives under dest/.
    workerUrl.pathname = workerUrl.pathname.replace('/src/', '/dest/');
    // Drop JEST_WORKER_ID so pino-pretty is used in worker logs, matching the WorkerWallet pattern.
    const { JEST_WORKER_ID: _, ...parentEnv } = process.env;

    const { port1: workerPort, port2: mainPort } = new MessageChannel();

    const workerData = {
      env: opts.env,
      genesisJson: opts.genesis ? jsonStringify(opts.genesis) : undefined,
      dateProviderPort: workerPort,
      dontStartSequencer: opts.dontStartSequencer ?? false,
      dontStartProverNode: opts.dontStartProverNode ?? false,
    };

    const worker = new Worker(workerUrl, {
      workerData,
      transferList: [workerPort],
      env: {
        ...parentEnv,
        ...(process.stderr.isTTY || process.env.FORCE_COLOR ? { FORCE_COLOR: '1' } : {}),
        LOG_LEVEL: process.env.WORKER_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'warn',
        ...(opts.actor ? { LOG_ACTOR: opts.actor } : {}),
      },
    });

    // Register the main-side port with the bridge so the worker receives every TestDateProvider mutation.
    opts.dateProviderBridge.addObserver(mainPort);

    const connector = new NodeConnector(worker);
    const transport = new TransportClient<WorkerMsg>(connector);
    await transport.open();

    const nw = new NodeWorker(worker, transport, mainPort, opts.dateProviderBridge);

    const { promise: workerDied, reject: rejectWorkerDied } = promiseWithResolvers<void>();

    const onError = (err: Error): void => {
      worker.off('exit', onExit);
      rejectWorkerDied(new Error(`Node worker thread error: ${err.message}`));
    };
    const onExit = (code: number): void => {
      worker.off('error', onError);
      rejectWorkerDied(new Error(`Node worker thread exited with code ${code} before becoming ready`));
    };

    worker.once('error', onError);
    worker.once('exit', onExit);

    const timeout = sleep(WORKER_READY_TIMEOUT_MS).then(() => {
      throw new Error(`Node worker creation timed out after ${WORKER_READY_TIMEOUT_MS / 1000}s`);
    });

    try {
      // Cheap warmup RPC that exercises the block source; also confirms the full node is wired up.
      await Promise.race([nw.client.getL2Tips(), workerDied, timeout]);
    } catch (err) {
      log.error('Node worker creation failed, cleaning up', { error: String(err) });
      opts.dateProviderBridge.removeObserver(mainPort);
      mainPort.close();
      transport.close();
      await worker.terminate();
      throw err;
    } finally {
      worker.off('error', onError);
      worker.off('exit', onExit);
    }

    return nw;
  }

  /** Typed proxy; every access is a JSON-RPC call to the worker. */
  public get client(): AztecNode & AztecNodeAdmin & AztecNodeDebug {
    return this.proxy;
  }

  /** Closes the transport, detaches the date-provider port, and terminates the worker. */
  public async stop(): Promise<void> {
    this.bridge.removeObserver(this.mainPort);
    this.mainPort.close();
    this.transport.close();
    await this.worker.terminate();
  }
}
