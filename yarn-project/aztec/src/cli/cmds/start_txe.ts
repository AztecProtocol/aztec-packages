import { startHttpRpcServer } from '@aztec/foundation/json-rpc/server';
import type { Logger } from '@aztec/foundation/log';
import { createTXERpcServer } from '@aztec/txe/server';

export async function startTXE(options: any, signalHandlers: Array<() => Promise<void>>, debugLogger: Logger) {
  debugLogger.info(`Setting up TXE...`);

  const txeServer = await createTXERpcServer(debugLogger);
  const httpServer = await startHttpRpcServer(txeServer, {
    port: options.port,
    timeoutMs: 1e3 * 60 * 5,
  });

  signalHandlers.push(() => new Promise<void>(resolve => httpServer.close(() => resolve())));

  debugLogger.info(`TXE listening on port ${httpServer.port}`);
}
