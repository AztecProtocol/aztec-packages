import { type DebugLogger } from '@aztec/aztec.js';
import { type LogFn } from '@aztec/foundation/log';
import { type BootnodeConfig, bootnodeConfigMappings } from '@aztec/p2p';
import runBootstrapNode from '@aztec/p2p-bootstrap';

import { extractRelevantOptions } from '../util.js';

export const startP2PBootstrap = async (options: any, userLog: LogFn, debugLogger: DebugLogger) => {
  // Start a P2P bootstrap node.
  const config = extractRelevantOptions<BootnodeConfig>(options, bootnodeConfigMappings, 'p2p');

  // TODO: fix up telemetry client config here
  await runBootstrapNode(config, debugLogger);
  userLog(`P2P bootstrap node started on ${config.udpListenAddress}`);
};
