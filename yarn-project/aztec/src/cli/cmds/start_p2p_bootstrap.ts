import { type Logger } from '@aztec/aztec.js';
import { type LogFn } from '@aztec/foundation/log';
import { type BootnodeConfig, bootnodeConfigMappings } from '@aztec/p2p';
import runBootstrapNode from '@aztec/p2p-bootstrap';
import {
  createAndStartTelemetryClient,
  getConfigEnvVars as getTelemetryClientConfig,
} from '@aztec/telemetry-client/start';

import { extractRelevantOptions } from '../util.js';

export const startP2PBootstrap = async (options: any, userLog: LogFn, debugLogger: Logger) => {
  // Start a P2P bootstrap node.
  const config = extractRelevantOptions<BootnodeConfig>(options, bootnodeConfigMappings, 'p2p');
  const telemetryClient = await createAndStartTelemetryClient(getTelemetryClientConfig());

  await runBootstrapNode(config, telemetryClient, debugLogger);
  userLog(`P2P bootstrap node started on ${config.udpListenAddress}`);
};
