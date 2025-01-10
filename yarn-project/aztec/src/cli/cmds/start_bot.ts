import { type BotConfig, BotRunner, botConfigMappings, getBotRunnerApiHandler } from '@aztec/bot';
import { type AztecNode, type PXE } from '@aztec/circuit-types';
import { type NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type LogFn } from '@aztec/foundation/log';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { getConfigEnvVars as getTelemetryClientConfig, initTelemetryClient } from '@aztec/telemetry-client';

import { extractRelevantOptions } from '../util.js';

export async function startBot(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
) {
  const { proverNode, archiver, sequencer, p2pBootstrap, txe, prover } = options;
  if (proverNode || archiver || sequencer || p2pBootstrap || txe || prover) {
    userLog(
      `Starting a bot with --prover-node, --prover, --archiver, --sequencer, --p2p-bootstrap, or --txe is not supported.`,
    );
    process.exit(1);
  }
  // Start a PXE client that is used by the bot if required
  let pxe: PXE | undefined;
  if (options.pxe) {
    const { addPXE } = await import('./start_pxe.js');
    pxe = await addPXE(options, signalHandlers, services, userLog);
  }

  const telemetry = await initTelemetryClient(getTelemetryClientConfig());
  await addBot(options, signalHandlers, services, { pxe, telemetry });
}

export function addBot(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  deps: { pxe?: PXE; node?: AztecNode; telemetry: TelemetryClient },
) {
  const config = extractRelevantOptions<BotConfig>(options, botConfigMappings, 'bot');

  const botRunner = new BotRunner(config, deps);
  if (!config.noStart) {
    void botRunner.start(); // Do not block since bot setup takes time
  }
  services.bot = getBotRunnerApiHandler(botRunner);
  signalHandlers.push(botRunner.stop);
  return Promise.resolve();
}
