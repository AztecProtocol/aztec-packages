import { DebugLogger } from '@aztec/foundation/log';
import { createTXERpcServer } from '@aztec/txe';

import http from 'http';

const { TXE_PORT = '8081' } = process.env;

export const startTXE = async (options: any, debugLogger: DebugLogger) => {
  const txeServer = createTXERpcServer(debugLogger);
  const app = txeServer.getApp();
  const httpServer = http.createServer(app.callback());
  httpServer.timeout = 1e3 * 60 * 5; // 5 minutes
  httpServer.listen(parseInt(options.port || TXE_PORT));
};
