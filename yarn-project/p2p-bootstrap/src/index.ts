import 'dotenv/config';
import { createDebugLogger } from '@aztec/foundation/log';
import { BootstrapNode } from '@aztec/p2p';

const logger = createDebugLogger('aztec:bootstrap_node');

const { P2P_TCP_LISTEN_PORT, PEER_ID } = process.env;

/**
 * The application entry point.
 */
async function main() {
  if (!P2P_TCP_LISTEN_PORT) {
    throw new Error(`Env var P2P_TCP_LISTEN_PORT must be provided`);
  }
  if (!PEER_ID) {
    throw new Error(`Env var PEER_ID must be provided`);
  }
  const tcpListenPort = +P2P_TCP_LISTEN_PORT;
  const privateKey = PEER_ID;
  const bootstrapNode = new BootstrapNode(logger);
  logger(`Starting bootstrap node on port ${tcpListenPort}`);
  await bootstrapNode.start(tcpListenPort, privateKey);
  logger('Node started');

  const stop = async () => {
    logger('Stopping bootstrap node...');
    await bootstrapNode.stop();
    logger('Node stopped');
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch(err => {
  logger(err);
});
