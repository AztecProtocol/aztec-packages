import { type PXE, PXESchema } from '@aztec/circuit-types';
import { createNamespacedSafeJsonRpcServer, createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';

import http from 'http';

/**
 * Wraps an instance of Private eXecution Environment (PXE) implementation to a JSON RPC HTTP interface.
 * @returns A new instance of the HTTP server.
 */
export function createPXERpcServer(pxeService: PXE) {
  return createSafeJsonRpcServer(pxeService, PXESchema);
}

/**
 * Creates an http server that forwards calls to the PXE and starts it on the given port.
 * @param pxeService - PXE that answers queries to the created HTTP server.
 * @param port - Port to listen in.
 * @returns A running http server.
 */
export function startPXEHttpServer(pxeService: PXE, port: string | number): http.Server {
  const rpcServer = createNamespacedSafeJsonRpcServer({ pxe: [pxeService, PXESchema] });

  const app = rpcServer.getApp();
  const httpServer = http.createServer(app.callback());
  httpServer.listen(port);

  return httpServer;
}
