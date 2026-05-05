/**
 * Parent-side proxy for an AztecNodeService running in a worker thread.
 *
 * Implements the AztecNode interface by forwarding all method calls over
 * a TransportClient to the worker thread. Additional test-specific methods
 * (getPeers, getGossipMeshPeerCount, getValidatorAddresses, etc.) are exposed
 * as flat RPC calls. getP2P() returns a shim object with these methods for
 * compatibility with P2PNetworkTest.waitForP2PMeshConnectivity().
 *
 * Based on the WorkerWallet pattern at test-wallet/worker_wallet.ts.
 */
import type { AztecNodeConfig } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { ApiSchema } from '@aztec/foundation/schemas';
import { sleep } from '@aztec/foundation/sleep';
import type { EluSummaryStats } from '@aztec/foundation/testing/elu_monitor';
import { NodeConnector, TransportClient } from '@aztec/foundation/transport';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { AztecNode, PeerInfo } from '@aztec/stdlib/interfaces/server';
import type { TopicType } from '@aztec/stdlib/p2p';
import type { GenesisData } from '@aztec/stdlib/world-state';

import { Worker } from 'worker_threads';

import type { GossipSourceRecord } from './gossip_source_observer.js';
import { WorkerAztecNodeSchema } from './worker_node_schema.js';

type WorkerMsg = { fn: string; args: string };

const log = createLogger('e2e:p2p:worker-node');

const WORKER_READY_TIMEOUT_MS = 120_000;

/**
 * Recursively walks a value, replacing class instances with JSON-safe tagged objects.
 * Handles: SecretValue (#value private field), EthAddress, AztecAddress, bigint.
 */
function markForSerialization(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'bigint') {
    return { __t: 'bigint', v: value.toString() };
  }
  if (value instanceof EthAddress) {
    return { __t: 'EthAddress', v: value.toString() };
  }
  if (value instanceof AztecAddress) {
    return { __t: 'AztecAddress', v: value.toString() };
  }
  // SecretValue — detect via getValue method + private #value field
  if (typeof value === 'object' && typeof value.getValue === 'function' && typeof value.toJSON === 'function') {
    return { __t: 'SecretValue', v: markForSerialization(value.getValue()) };
  }
  if (Array.isArray(value)) {
    return value.map(markForSerialization);
  }
  if (typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = markForSerialization(v);
    }
    return result;
  }
  return value;
}

/** Serializes an AztecNodeConfig for transfer to a worker thread as a JSON string. */
export function serializeConfigForWorker(config: AztecNodeConfig): string {
  return JSON.stringify(markForSerialization(config));
}

/** Serializes GenesisData to JSON. Fr fields use toJSON() → string, bigint → string. */
function serializeGenesisForWorker(genesis: GenesisData): string {
  return JSON.stringify({
    prefilledPublicData: genesis.prefilledPublicData.map(leaf => ({
      slot: leaf.slot.toString(),
      value: leaf.value.toString(),
    })),
    genesisTimestamp: genesis.genesisTimestamp.toString(),
  });
}

/** Config for creating a WorkerAztecNode. */
export type WorkerNodeConfig = {
  config: AztecNodeConfig;
  genesis?: GenesisData;
  dontStartSequencer?: boolean;
  initialTimeMs?: number;
  metricsPort?: number;
  /** ELU monitor file path. If set, the worker writes a labeled section to this shared file. */
  eluFilePath?: string;
  /** Worker index for ELU section labeling. */
  workerIndex?: number;
};

/**
 * Proxy to an AztecNodeService running in a worker thread.
 *
 * All AztecNode and AztecNodeAdmin interface methods are dynamically bound to forward
 * calls via the TransportClient. Extra test methods (getPeers, etc.)
 * are available directly and via getP2P()/getSequencer() shims.
 */
export interface WorkerAztecNode extends AztecNode, AztecNodeAdmin {
  /** Returns connected peer info from the worker's P2P layer. */
  getPeers(includePending?: boolean): Promise<PeerInfo[]>;
  /** Returns gossipsub mesh peer count for a topic from the worker's P2P layer. */
  getGossipMeshPeerCount(topicType: TopicType): Promise<number>;
  /** Returns validator addresses from the worker's sequencer, or undefined if no sequencer. */
  getValidatorAddresses(): Promise<EthAddress[] | undefined>;
  /** Starts the sequencer in the worker. */
  startSequencer(): Promise<void>;
  /** Test-only: sets the tx pool's drop probability (0-1) for pending-pool additions. */
  setTxPoolDropProbability(probability: number): Promise<void>;
  /** Test-only: installs a GossipSourceObserver on the worker's P2PService. */
  startGossipSourceRecording(): Promise<void>;
  /** Test-only: returns and clears the list of recorded gossip sources. */
  getGossipSources(): Promise<GossipSourceRecord[]>;
  /** Broadcasts a time update to the worker's DateProvider. */
  setTime(timeMs: number): Promise<void>;
  /** Returns a shim P2P object compatible with P2PNetworkTest helpers. */
  getP2P(): {
    getPeers: (includePending?: boolean) => Promise<PeerInfo[]>;
    getGossipMeshPeerCount: (topicType: TopicType) => Promise<number>;
  };
  /** Returns the worker's ELU summary stats, or undefined if no monitor is running. */
  getEluStats(): Promise<EluSummaryStats | undefined>;
  /** Stops the node in the worker and terminates the worker thread. */
  stop(): Promise<void>;
}

/**
 * Creates a WorkerAztecNode by spawning a worker thread that runs an AztecNodeService.
 *
 * @param workerConfig - Configuration for the worker node.
 * @returns A proxy implementing AztecNode + extra test methods.
 */
export async function createWorkerAztecNode(workerConfig: WorkerNodeConfig): Promise<WorkerAztecNode> {
  const configJson = serializeConfigForWorker(workerConfig.config);

  // Resolve worker script URL — replace /src/ with /dest/ for Jest
  const workerUrl = new URL('./node_worker_script.js', import.meta.url);
  workerUrl.pathname = workerUrl.pathname.replace('/src/', '/dest/');

  // Remove JEST_WORKER_ID so the worker uses pino-pretty transport instead of Jest's raw output
  const { JEST_WORKER_ID: _, ...parentEnv } = process.env;

  const genesisJson = workerConfig.genesis ? serializeGenesisForWorker(workerConfig.genesis) : undefined;

  const worker = new Worker(workerUrl, {
    workerData: {
      configJson,
      genesisJson,
      dontStartSequencer: workerConfig.dontStartSequencer,
      initialTimeMs: workerConfig.initialTimeMs,
      metricsPort: workerConfig.metricsPort,
      eluFilePath: workerConfig.eluFilePath,
      workerIndex: workerConfig.workerIndex,
    },
    env: {
      ...parentEnv,
      ...(process.stderr.isTTY || process.env.FORCE_COLOR ? { FORCE_COLOR: '1' } : {}),
      LOG_LEVEL: process.env.WORKER_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'info',
    },
  });

  const connector = new NodeConnector(worker);
  const client = new TransportClient<WorkerMsg>(connector);
  await client.open();

  // Build the proxy object
  const schema = WorkerAztecNodeSchema as ApiSchema;

  const callRaw = async (fn: string, ...args: any[]): Promise<string> => {
    const argsJson = jsonStringify(args);
    return (await client.request({ fn, args: argsJson })) as string;
  };

  const call = async (fn: string, ...args: any[]): Promise<any> => {
    const resultJson = await callRaw(fn, ...args);
    const methodSchema = schema[fn];
    if (!methodSchema) {
      throw new Error(`No schema for method: ${fn}`);
    }
    // Handle void/undefined returns
    if ([null, undefined, 'null', 'undefined', ''].includes(resultJson as any)) {
      return undefined;
    }
    return methodSchema.returnType().parseAsync(JSON.parse(resultJson));
  };

  // Create proxy with dynamically bound methods from schema
  const proxy: any = {};

  for (const method of Object.keys(schema)) {
    proxy[method] = (...args: any[]) => call(method, ...args);
  }

  // getP2P() returns a shim with the P2P methods tests use
  proxy.getP2P = () => ({
    getPeers: (includePending?: boolean) => call('getPeers', includePending),
    getGossipMeshPeerCount: (topicType: TopicType) => call('getGossipMeshPeerCount', topicType),
  });

  // ELU summary captured during stop() so callers can read it after the worker is terminated.
  let cachedEluStats: EluSummaryStats | undefined;

  // stop() gracefully shuts down the worker node and terminates the thread.
  // Captures the ELU summary in the window after stopNode (which flushes lastSummaryStats inside
  // the worker) and before worker termination (after which RPC calls fail).
  //
  // The stopNode RPC is bounded by STOP_NODE_DEADLINE_MS so a hung worker can't block the test.
  // Errors are logged rather than swallowed so a regression where the RPC consistently fails
  // becomes visible in the test output.
  proxy.stop = async () => {
    // 15 s gives a busy worker validator time to drain its full stop chain (validator client
    // + proposalHandler drain + p2p client + world-state + archiver) on heavy slashing tests
    // (inactivity_slash, validators_sentinel) where 5 s was too tight. If a worker genuinely
    // hangs, the permanent error listener installed at the bottom of createWorkerAztecNode
    // catches the napi error from the abandoned worker after we worker.terminate().
    const stopNodeDeadlineMs = 15_000;
    try {
      const stopChain = (async () => {
        await call('stopNode');
        cachedEluStats = await call('getEluStats');
      })();
      const deadline = sleep(stopNodeDeadlineMs).then(() => {
        throw new Error(`worker stopNode RPC exceeded ${stopNodeDeadlineMs}ms deadline`);
      });
      await Promise.race([stopChain, deadline]);
    } catch (err) {
      log.warn(`Worker stop failed, terminating without graceful stop`, { error: String(err) });
    }
    client.close();
    await worker.terminate();
  };

  // Override the schema-generated getEluStats so callers reading it post-stop see the cached
  // value instead of attempting an RPC call on a terminated worker.
  proxy.getEluStats = () => Promise.resolve(cachedEluStats);

  // Warmup — wait for the worker to be ready by calling isReady()
  const { promise: workerDied, reject: rejectWorkerDied } = promiseWithResolvers<void>();

  const onError = (err: Error): void => {
    worker.off('exit', onExit!);
    rejectWorkerDied(new Error(`Worker node thread error: ${err.message}`));
  };

  const onExit = (code: number): void => {
    worker.off('error', onError!);
    rejectWorkerDied(new Error(`Worker node thread exited with code ${code} before becoming ready`));
  };

  worker.once('error', onError);
  worker.once('exit', onExit);

  const timeout = sleep(WORKER_READY_TIMEOUT_MS).then(() => {
    throw new Error(`Worker node creation timed out after ${WORKER_READY_TIMEOUT_MS / 1000}s`);
  });

  try {
    await Promise.race([proxy.isReady(), workerDied, timeout]);
  } catch (err) {
    log.error('Worker node creation failed, cleaning up', { error: String(err) });
    client.close();
    await worker.terminate();
    throw err;
  } finally {
    worker.off('error', onError);
    worker.off('exit', onExit);
  }

  // Install a permanent error listener so napi errors raised by the worker after warmup
  // (e.g. an abandoned-but-still-alive worker hitting a race during teardown after stopNode
  // exceeded its deadline) are logged instead of aborting the parent process. Without this,
  // an uncaught Napi::Error in the worker takes down the entire Jest process.
  worker.on('error', err => {
    log.warn(`Worker error after warmup, suppressing to keep parent alive`, { error: String(err) });
  });

  return proxy as WorkerAztecNode;
}
