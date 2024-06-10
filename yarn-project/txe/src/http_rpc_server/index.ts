import { JsonRpcServer } from '@aztec/foundation/json-rpc/server';

import http from 'http';

import { type TXEService } from '../txe_service/txe_service.js';

/**
 * Wraps an instance of Private eXecution Environment (TXE) implementation to a JSON RPC HTTP interface.
 * @returns A new instance of the HTTP server.
 */
export function createTXERpcServer(txeService: TXEService): JsonRpcServer {
  return new JsonRpcServer(txeService, {}, {}, ['init']);
}

/**
 * Creates an http server that forwards calls to the TXE and starts it on the given port.
 * @param txeService - TXE that answers queries to the created HTTP server.
 * @param port - Port to listen in.
 * @returns A running http server.
 */
export function startTXEHttpServer(txeService: TXEService, port: string | number): http.Server {
  const txeServer = createTXERpcServer(txeService);

  const app = txeServer.getApp();
  const httpServer = http.createServer(app.callback());
  httpServer.listen(port);

  return httpServer;
}
