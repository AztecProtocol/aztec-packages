import { P2PBootstrapApiSchema } from '@aztec/circuit-types';
import { type NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type LogFn, createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/lmdb';
import { type BootnodeConfig, BootstrapNode, bootnodeConfigMappings } from '@aztec/p2p';
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
  const telemetryClient = await initTelemetryClient(getTelemetryClientConfig());
  const store = await createStore('p2p-bootstrap', config, createLogger('p2p:bootstrap:store'));
  const node = new BootstrapNode(store, telemetryClient);
  await node.start(config);
  signalHandlers.push(() => node.stop());
  services.bootstrap = [node, P2PBootstrapApiSchema];
  userLog(`P2P bootstrap node started on ${config.udpListenAddress}`);
}
