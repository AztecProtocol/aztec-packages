import http from 'http';
import { getHttpRpcServer } from '@aztec/aztec-rpc';
import { createDebugLogger } from '@aztec/foundation/log';

const { SERVER_PORT = 8080 } = process.env;

const logger = createDebugLogger;

/**
 * Create and start a new Aztec RCP HTTP Server
 */
async function main() {
  const rpcServer = await getHttpRpcServer();
  const httpServer = http.createServer(rpcServer.getApp().callback());
  httpServer.listen(SERVER_PORT);
}

main()
  .then(() => logger(`Aztec JSON RPC listening on port ${SERVER_PORT}`))
  .catch(err => {
    logger(err);
    process.exit(1);
  });
