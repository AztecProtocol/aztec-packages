import {
  Faucet,
  FaucetSchema,
  createFaucetHttpServer,
  faucetConfigMapping,
  getFaucetConfigFromEnv,
} from '@aztec/aztec-faucet';
import { type NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type LogFn } from '@aztec/foundation/log';

import { extractNamespacedOptions, extractRelevantOptions } from '../util.js';

export async function startFaucet(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  log: LogFn,
) {
  const faucetOptions = extractNamespacedOptions(options, 'faucet');
  const config = {
    ...getFaucetConfigFromEnv(),
    ...extractRelevantOptions(options, faucetConfigMapping, 'faucet'),
  };

  const faucet = await Faucet.create(config);
  if (faucetOptions.apiServer) {
    const httpServer = createFaucetHttpServer(faucet);
    httpServer.listen(faucetOptions.apiServerPort);
    signalHandlers.push(() => new Promise(res => httpServer.close(() => res())));
    log(`Faucet now running on port: ${faucetOptions.apiServerPort}`);
  }

  services.faucet = [faucet, FaucetSchema];
}
