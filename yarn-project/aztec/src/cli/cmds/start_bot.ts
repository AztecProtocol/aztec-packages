import { type BotConfig, BotRunner, botConfigMappings, getBotRunnerApiHandler } from '@aztec/bot';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import type { LogFn } from '@aztec/foundation/log';
import { type AztecNode, type AztecNodeAdmin, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';
import type { TelemetryClient } from '@aztec/telemetry-client';
import {
  getConfigEnvVars as getTelemetryClientConfig,
  initTelemetryClient,
  makeTracedFetch,
} from '@aztec/telemetry-client';
import { TestWallet } from '@aztec/test-wallet';

import { extractRelevantOptions } from '../util.js';
import { getVersions } from '../versioning.js';

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

  const fetch = makeTracedFetch([1, 2, 3], true);
  const config = extractRelevantOptions<BotConfig>(options, botConfigMappings, 'bot');
  if (!config.nodeUrl) {
    throw new Error('The bot requires access to a Node');
  }

  const aztecNode = createAztecNodeClient(config.nodeUrl, getVersions(), fetch);

  // Start a PXE client and get a wallet that is used by the bot if required
  const { startPXEServiceGetWallet } = await import('./start_pxe.js');
  const { wallet } = await startPXEServiceGetWallet(options, services, userLog, { node: aztecNode });

  const telemetry = initTelemetryClient(getTelemetryClientConfig());
  await addBot(options, signalHandlers, services, wallet, aztecNode, telemetry, undefined);
}

export function addBot(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  wallet: TestWallet,
  aztecNode: AztecNode,
  telemetry: TelemetryClient,
  aztecNodeAdmin?: AztecNodeAdmin,
) {
  const config = extractRelevantOptions<BotConfig>(options, botConfigMappings, 'bot');

  const botRunner = new BotRunner(config, wallet, aztecNode, telemetry, aztecNodeAdmin);
  if (!config.noStart) {
    void botRunner.start(); // Do not block since bot setup takes time
  }
  services.bot = getBotRunnerApiHandler(botRunner);
  signalHandlers.push(botRunner.stop);
  return Promise.resolve();
}
