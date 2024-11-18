import { startHttpRpcServer } from '@aztec/foundation/json-rpc/server';
import { type DebugLogger } from '@aztec/foundation/log';
import { createTXERpcServer } from '@aztec/txe';

export async function startTXE(options: any, debugLogger: DebugLogger) {
  debugLogger.info(`Setting up TXE...`);

  const txeServer = createTXERpcServer(debugLogger);
  const { port } = await startHttpRpcServer(txeServer, {
    port: options.port,
    timeoutMs: 1e3 * 60 * 5,
  });

  debugLogger.info(`TXE listening on port ${port}`);
}
