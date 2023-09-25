import { DeployL1Contracts } from '@aztec/ethereum';
import { JsonRpcServer } from '@aztec/foundation/json-rpc/server';

import http from 'http';

import { createHelperRouter } from './routes.js';

/**
 * Creates an http server that forwards calls to the underlying instance and starts it on the given port.
 * @param instance - Instance to wrap in a JSON-RPC server.
 * @param deployedL1Contracts - Info on L1 deployed contracts.
 * @param port - Port to listen in.
 * @returns A running http server.
 */
export function startHttpRpcServer<T>(
  instance: T,
  jsonRpcFactoryFunc: (instance: T) => JsonRpcServer,
  deployedL1Contracts: DeployL1Contracts,
  port: string | number,
): http.Server {
  const rpcServer = jsonRpcFactoryFunc(instance);

  const app = rpcServer.getApp();
  const helperRouter = createHelperRouter(deployedL1Contracts);
  app.use(helperRouter.routes());
  app.use(helperRouter.allowedMethods());

  const httpServer = http.createServer(app.callback());
  httpServer.listen(port);

  return httpServer;
}
