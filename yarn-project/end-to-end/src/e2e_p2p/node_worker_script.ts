/**
 * Worker thread script that creates and runs an AztecNodeService.
 *
 * The parent thread passes config and parameters via workerData. This script:
 * 1. Deserializes the config (re-wrapping SecretValue fields, reconstructing EthAddress instances)
 * 2. Creates an AztecNodeService via createAndSync
 * 3. Starts a TransportServer to handle RPC calls from the parent
 *
 * Communication uses the same TransportServer/NodeListener pattern as WorkerWallet.
 */
import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import type { ApiSchema } from '@aztec/foundation/schemas';
import { parseWithOptionals, schemaHasMethod } from '@aztec/foundation/schemas';
import { EluMonitor } from '@aztec/foundation/testing/elu_monitor';
import { TestDateProvider } from '@aztec/foundation/timer';
import { NodeListener, TransportServer } from '@aztec/foundation/transport';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { GenesisData } from '@aztec/stdlib/world-state';

import { appendFileSync, readFileSync, unlinkSync } from 'node:fs';
import { workerData } from 'worker_threads';

import { getEndToEndTestTelemetryClient } from '../fixtures/with_telemetry_utils.js';
import { GossipSourceObserver } from './gossip_source_observer.js';
import { WorkerAztecNodeSchema } from './worker_node_schema.js';

const logger = createLogger('e2e:p2p:node-worker');

/** Data passed from the parent thread via workerData. */
type NodeWorkerData = {
  /** JSON-serialized AztecNodeConfig with SecretValue fields unwrapped. */
  configJson: string;
  /** JSON-serialized GenesisData, or undefined. */
  genesisJson?: string;
  /** Whether to skip starting the sequencer. */
  dontStartSequencer?: boolean;
  /** Initial time (ms) to set on the DateProvider. */
  initialTimeMs?: number;
  /** Metrics port for telemetry. */
  metricsPort?: number;
  /** ELU monitor file path (shared with main thread). If set, this worker writes its own section. */
  eluFilePath?: string;
  /** Worker index for labeling the ELU section (e.g. 0 → "Worker 0"). */
  workerIndex?: number;
};

/**
 * Recursively walks a parsed JSON value, restoring tagged objects to their class instances.
 * Reverses the marking done by serializeConfigForWorker's markForSerialization.
 */
function reviveMarkedValues(value: any): any {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  // Tagged objects from markForSerialization
  if (value.__t) {
    switch (value.__t) {
      case 'bigint':
        return BigInt(value.v);
      case 'EthAddress':
        return EthAddress.fromString(value.v);
      case 'AztecAddress':
        return AztecAddress.fromString(value.v);
      case 'SecretValue':
        return new SecretValue(reviveMarkedValues(value.v));
    }
  }
  if (Array.isArray(value)) {
    return value.map(reviveMarkedValues);
  }
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = reviveMarkedValues(v);
  }
  return result;
}

/** Deserializes an AztecNodeConfig from JSON, reconstructing all class instances. */
function deserializeConfig(json: string): AztecNodeConfig {
  return reviveMarkedValues(JSON.parse(json)) as AztecNodeConfig;
}

/** Deserializes GenesisData from JSON, reconstructing Fr and PublicDataTreeLeaf instances. */
function deserializeGenesis(json: string): GenesisData {
  const raw = JSON.parse(json);
  return {
    prefilledPublicData: (raw.prefilledPublicData ?? []).map(
      (leaf: any) => new PublicDataTreeLeaf(Fr.fromString(leaf.slot), Fr.fromString(leaf.value)),
    ),
    genesisTimestamp: BigInt(raw.genesisTimestamp),
  };
}

try {
  const { configJson, genesisJson, dontStartSequencer, initialTimeMs, metricsPort, eluFilePath, workerIndex } =
    workerData as NodeWorkerData;

  logger.info('Initializing worker node');

  const config = deserializeConfig(configJson);
  const genesis = genesisJson ? deserializeGenesis(genesisJson) : undefined;

  // Each worker gets its own DateProvider — the parent broadcasts setTime via RPC
  const dateProvider = new TestDateProvider();
  if (initialTimeMs !== undefined) {
    dateProvider.setTime(initialTimeMs);
  }

  const telemetry = await getEndToEndTestTelemetryClient(metricsPort);

  const node = await AztecNodeService.createAndSync(
    config,
    { telemetry, dateProvider },
    { genesis, dontStartSequencer },
  );

  // Start ELU monitor for this worker's event loop.
  // Write to a per-worker temp file to avoid interleaving with other writers,
  // then append to the shared file on stop.
  let eluMonitor: EluMonitor | undefined;
  let eluTempPath: string | undefined;
  let gossipObserver: GossipSourceObserver | undefined;
  if (eluFilePath) {
    const { writeFileSync } = await import('node:fs');
    const label = `Worker ${workerIndex ?? '?'}`;
    eluTempPath = `${eluFilePath}.worker-${workerIndex ?? 'x'}.tmp`;
    writeFileSync(eluTempPath, ''); // Truncate any stale temp file from a previous run
    eluMonitor = new EluMonitor(eluTempPath, undefined, label);
    eluMonitor.startTest(label);
  }

  logger.info('Worker node initialized');

  // Custom method handlers for methods not on the standard AztecNode interface.
  // These bridge flat RPC methods to the internal node APIs.
  const customMethods: Record<string, (...args: any[]) => Promise<any>> = {
    getPeers: (includePending?: boolean) => node.getP2P().getPeers(includePending),
    getGossipMeshPeerCount: (topicType: any) => node.getP2P().getGossipMeshPeerCount(topicType),
    getValidatorAddresses: () => Promise.resolve(node.getSequencer()?.validatorAddresses),
    startSequencer: async () => {
      const seq = node.getSequencer();
      if (seq) {
        await seq.start();
      }
    },
    // Admin methods — delegate to AztecNodeService which implements AztecNodeAdmin
    setConfig: (config: any) => node.setConfig(config),
    getConfig: () => node.getConfig(),
    getSlashOffenses: (round: any) => node.getSlashOffenses(round),
    // Test-only: toggles the tx pool's drop probability without exposing the knob on the public
    // admin API. Routes through updateP2PConfig so the tx pool picks up the change at runtime.
    setTxPoolDropProbability: (probability: number) =>
      node.getP2P().updateP2PConfig({ dropTransactionsProbability: probability }),
    startGossipSourceRecording: () => {
      if (!gossipObserver) {
        gossipObserver = new GossipSourceObserver();
        gossipObserver.attach((node.getP2P() as any).p2pService);
      }
      return Promise.resolve();
    },
    getGossipSources: () => Promise.resolve(gossipObserver?.drain() ?? []),
    setTime: (timeMs: number) => {
      dateProvider.setTime(timeMs);
      return Promise.resolve();
    },
    stopNode: async () => {
      eluMonitor?.stop();
      // Append the per-worker temp ELU file to the shared file, then clean up
      if (eluTempPath && eluFilePath) {
        try {
          appendFileSync(eluFilePath, readFileSync(eluTempPath));
          unlinkSync(eluTempPath);
        } catch {
          // Best-effort — don't fail the stop if file ops fail
        }
      }
      await node.stop();
    },
    getEluStats: () => Promise.resolve(eluMonitor?.getSummaryStats()),
  };

  const schema = WorkerAztecNodeSchema as ApiSchema;
  const listener = new NodeListener();
  const server = new TransportServer<{ fn: string; args: string }>(listener, async msg => {
    if (!schemaHasMethod(schema, msg.fn)) {
      throw new Error(`Unknown method: ${msg.fn}`);
    }
    const jsonParams = JSON.parse(msg.args) as unknown[];
    const args: any[] = await parseWithOptionals(jsonParams, schema[msg.fn].parameters());
    const handler = customMethods[msg.fn];
    const result = handler ? await handler(...args) : await (node as any)[msg.fn](...args);
    return jsonStringify(result);
  });
  server.start();
} catch (err: unknown) {
  logger.error('Worker node initialization failed', { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
}
