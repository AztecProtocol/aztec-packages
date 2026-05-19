import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import type { LogFn } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { type BootnodeConfig, BootstrapNode, bootnodeConfigMappings } from '@aztec/p2p';
import { emptyChainConfig } from '@aztec/stdlib/config';
import { P2PBootstrapApiSchema } from '@aztec/stdlib/interfaces/server';
import { initTelemetryClient, telemetryClientConfigMappings } from '@aztec/telemetry-client';

import type { ConfigResolverFn } from '../util.js';

export async function startP2PBootstrap(
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
  resolveConfig: ConfigResolverFn,
) {
  const config = resolveConfig<BootnodeConfig>(bootnodeConfigMappings, 'p2pBootstrap');
  const safeConfig = { ...config, peerIdPrivateKey: '<redacted>' };
  userLog(`Starting P2P bootstrap node with config: ${jsonStringify(safeConfig)}`);

  const telemetryClient = await initTelemetryClient(resolveConfig(telemetryClientConfigMappings, 'tel'));

  const store = await createStore('p2p-bootstrap', 1, config);
  const node = new BootstrapNode(store, telemetryClient);
  await node.start(config);
  signalHandlers.push(() => node.stop());
  services.bootstrap = [node, P2PBootstrapApiSchema];
  userLog(`P2P bootstrap node started on ${config.p2pIp}:${config.p2pPort}`);
  return { config: emptyChainConfig };
}
