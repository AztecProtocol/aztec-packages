import { type BotConfig, BotRunner, BotStore, botConfigMappings, getBotRunnerApiHandler } from '@aztec/bot';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import type { LogFn } from '@aztec/foundation/log';
import { createStore, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { type CliPXEOptions, type PXEConfig, allPxeConfigMappings } from '@aztec/pxe/config';
import { type AztecNode, type AztecNodeAdmin, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';
import type { TelemetryClient } from '@aztec/telemetry-client';
import {
  getConfigEnvVars as getTelemetryClientConfig,
  initTelemetryClient,
  makeTracedFetch,
} from '@aztec/telemetry-client';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { extractRelevantOptions, stringifyConfig } from '../util.js';
import { getVersions } from '../versioning.js';

export async function startBot(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
) {
  const { proverNode, sequencer, p2pBootstrap, txe, prover } = options;
  if (proverNode || sequencer || p2pBootstrap || txe || prover) {
    userLog(`Starting a bot with --prover-node, --prover, --sequencer, --p2p-bootstrap, or --txe is not supported.`);
    process.exit(1);
  }

  const fetch = makeTracedFetch([1, 2, 3], true);
  const config = extractRelevantOptions<BotConfig>(options, botConfigMappings, 'bot');
  if (!config.nodeUrl) {
    throw new Error('The bot requires access to a Node');
  }

  const aztecNode = createAztecNodeClient(config.nodeUrl, getVersions(), fetch);

  const pxeConfig = extractRelevantOptions<PXEConfig & CliPXEOptions>(options, allPxeConfigMappings, 'pxe');
  userLog(`Creating bot wallet with config ${stringifyConfig(pxeConfig)}`);
  const wallet = await EmbeddedWallet.create(aztecNode, { pxeConfig });

  const telemetry = await initTelemetryClient(getTelemetryClientConfig());
  await addBot(options, signalHandlers, services, wallet, aztecNode, telemetry, undefined, userLog);
}

export async function addBot(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  wallet: EmbeddedWallet,
  aztecNode: AztecNode,
  telemetry: TelemetryClient,
  aztecNodeAdmin?: AztecNodeAdmin,
  userLog?: LogFn,
) {
  const config = extractRelevantOptions<BotConfig>(options, botConfigMappings, 'bot');
  userLog?.(`Starting bot with config ${stringifyConfig(config)}`);

  const db = await (config.dataDirectory
    ? createStore('bot', BotStore.SCHEMA_VERSION, config)
    : openTmpStore('bot', true, config.dataStoreMapSizeKb));

  const store = new BotStore(db);
  await store.cleanupOldClaims();

  const botRunner = new BotRunner(config, wallet, aztecNode, telemetry, aztecNodeAdmin, store);
  if (!config.noStart) {
    void botRunner.start(); // Do not block since bot setup takes time
  }
  services.bot = getBotRunnerApiHandler(botRunner);
  signalHandlers.push(botRunner.stop);
  return Promise.resolve();
}
