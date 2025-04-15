import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type LogFn, createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { type BootnodeConfig, BootstrapNode, bootnodeConfigMappings } from '@aztec/p2p';
import { emptyChainConfig } from '@aztec/stdlib/config';
import { P2PBootstrapApiSchema } from '@aztec/stdlib/interfaces/server';
import { getConfigEnvVars as getTelemetryClientConfig, initTelemetryClient } from '@aztec/telemetry-client';

import { extractRelevantOptions } from '../util.js';

export async function startP2PBootstrap(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
) {
  // Start a P2P bootstrap node.
  const config = extractRelevantOptions<BootnodeConfig>(options, bootnodeConfigMappings, 'p2p');
  const safeConfig = { ...config, peerIdPrivateKey: '<redacted>' };
  userLog(`Starting P2P bootstrap node with config: ${jsonStringify(safeConfig)}`);
  const telemetryClient = initTelemetryClient(getTelemetryClientConfig());
  const store = await createStore('p2p-bootstrap', 1, config, createLogger('p2p:bootstrap:store'));
  const node = new BootstrapNode(store, telemetryClient);
  await node.start(config);
  signalHandlers.push(() => node.stop());
  services.bootstrap = [node, P2PBootstrapApiSchema];
  userLog(`P2P bootstrap node started on ${config.p2pIp}:${config.p2pPort}`);
  return { config: emptyChainConfig };
}
