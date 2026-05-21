import { getChainConfigLayer, getNetworkConfig } from '@aztec/cli/config';
import { getActiveNetworkName } from '@aztec/foundation/config';
import {
  type NamespacedApiHandlers,
  createNamespacedSafeJsonRpcServer,
  getApiKeyAuthMiddleware,
  startHttpRpcServer,
} from '@aztec/foundation/json-rpc/server';
import type { LogFn, Logger } from '@aztec/foundation/log';
import type { ChainConfig } from '@aztec/stdlib/config';
import { AztecNodeAdminApiSchema, AztecNodeApiSchema, AztecNodeDebugApiSchema } from '@aztec/stdlib/interfaces/client';
import { dataConfigMappings } from '@aztec/stdlib/kv-store';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import { getVersioningMiddleware } from '@aztec/stdlib/versioning';
import { getOtelJsonRpcPropagationMiddleware } from '@aztec/telemetry-client';

import { type LocalNetworkConfig, createLocalNetwork, localNetworkConfigMappings } from '../local-network/index.js';
import { github, splash } from '../splash.js';
import { resolveAdminApiKey } from './admin_api_key_store.js';
import { apiConfigMappings } from './api_config.js';
import { createConfigResolver, installSignalHandlers } from './util.js';
import { getVersions } from './versioning.js';

export async function aztecStart(options: any, userLog: LogFn, debugLogger: Logger) {
  // list of 'stop' functions to call when process ends
  const signalHandlers: Array<() => Promise<void>> = [];
  const services: NamespacedApiHandlers = {};
  const adminServices: NamespacedApiHandlers = {};
  const packageVersion = getPackageVersion();
  let config: ChainConfig | undefined = undefined;

  // Resolve network name from CLI flag or env, then fetch remote config and chain defaults.
  const networkName = getActiveNetworkName(options.network);
  // For caching the network config fetch, use whichever data directory is explicitly available
  // before full resolution. The full resolver isn't built yet (it needs the network config).
  const earlyDataDir = options.dataDirectory ?? process.env.DATA_DIRECTORY;
  const cacheDir = earlyDataDir ? `${earlyDataDir}/cache` : undefined;
  const remoteNetworkConfig = networkName !== 'local' ? await getNetworkConfig(networkName, cacheDir) : undefined;
  const chainConfigLayer = getChainConfigLayer(networkName);
  const resolveConfig = createConfigResolver(options, remoteNetworkConfig, chainConfigLayer);
  const apiConfig = resolveConfig(apiConfigMappings);
  const { dataDirectory: resolvedDataDirectory } = resolveConfig(dataConfigMappings);

  if (options.localNetwork) {
    userLog(`${splash}\n${github}\n\n`);
    userLog(`Setting up Aztec local network ${packageVersion}, please stand by...`);

    // testAccounts lives on the genesis state mapping (default: false). For local network the default
    // should be true, so override the mapping default unless the user explicitly opted in or out via
    // env or CLI.
    const testAccountsExplicit =
      options['localNetwork.testAccounts'] !== undefined ||
      (process.env.TEST_ACCOUNTS !== undefined && process.env.TEST_ACCOUNTS !== '');

    const baseLocalConfig = resolveConfig(localNetworkConfigMappings, 'localNetwork');
    const localNetworkConfig: LocalNetworkConfig = {
      ...baseLocalConfig,
      testAccounts: testAccountsExplicit ? baseLocalConfig.testAccounts : true,
      // Local network always runs without real proofs.
      realProofs: false,
      // Setting the epoch duration to 2 by default for local network. This allows the epoch to be "proven" faster, so
      // the users can consume out hash without having to wait for a long time.
      // Note: We are not proving anything in the local network (realProofs == false). But in `createLocalNetwork`,
      // the EpochTestSettler will set the out hash to the outbox when an epoch is complete.
      aztecEpochDuration: 2,
    };

    const { node, stop } = await createLocalNetwork(localNetworkConfig, userLog);

    // Start Node and PXE JSON-RPC server
    signalHandlers.push(stop);
    services.node = [node, AztecNodeApiSchema];
    adminServices.node = [node, AztecNodeAdminApiSchema];
    services.nodeDebug = [node, AztecNodeDebugApiSchema];
  } else {
    // Block list for modules that cannot be run with --prover-node
    const proverNodeBlockList = ['sequencer', 'bot', 'p2pBootstrap', 'txe'];
    if (options.proverNode && proverNodeBlockList.some(block => options[block])) {
      userLog(`Cannot run --prover-node and ${proverNodeBlockList.join(', ')} in the same process`);
      process.exit(1);
    }

    // Route --prover-node through startNode
    if (options.proverNode && !options.node) {
      options.node = true;
    }

    if (options.node) {
      const { startNode } = await import('./cmds/start_node.js');
      ({ config } = await startNode(
        options,
        signalHandlers,
        services,
        adminServices,
        userLog,
        networkName,
        resolveConfig,
      ));
      if (apiConfig.nodeDebug && services.node) {
        services.nodeDebug = [services.node[0], AztecNodeDebugApiSchema];
      }
    } else if (options.bot) {
      const { startBot } = await import('./cmds/start_bot.js');
      await startBot(options, signalHandlers, services, userLog, resolveConfig);
    } else if (options.p2pBootstrap) {
      const { startP2PBootstrap } = await import('./cmds/start_p2p_bootstrap.js');
      ({ config } = await startP2PBootstrap(signalHandlers, services, userLog, resolveConfig));
    } else if (options.proverAgent) {
      const { startProverAgent } = await import('./cmds/start_prover_agent.js');
      await startProverAgent(options, signalHandlers, services, userLog, resolveConfig);
    } else if (options.proverBroker) {
      const { startProverBroker } = await import('./cmds/start_prover_broker.js');
      await startProverBroker(options, signalHandlers, services, userLog, resolveConfig);
    } else if (options.txe) {
      const { startTXE } = await import('./cmds/start_txe.js');
      await startTXE(options, signalHandlers, debugLogger);
    } else if (options.sequencer) {
      userLog(`Cannot run a standalone sequencer without a node`);
      process.exit(1);
    } else {
      userLog(`No module specified to start`);
      process.exit(1);
    }
  }

  installSignalHandlers(debugLogger.info, signalHandlers);
  const versions = getVersions(config);
  const versioningOpts = { packageVersion };

  // Start the main JSON-RPC server
  if (Object.entries(services).length > 0) {
    const rpcServer = createNamespacedSafeJsonRpcServer(services, {
      http200OnError: false,
      log: debugLogger,
      middlewares: [getOtelJsonRpcPropagationMiddleware(), getVersioningMiddleware(versions, versioningOpts)],
      maxBatchSize: apiConfig.rpcMaxBatchSize,
      maxBodySizeBytes: apiConfig.rpcMaxBodySize,
    });
    const { port } = await startHttpRpcServer(rpcServer, { apiPrefix: apiConfig.apiPrefix, port: apiConfig.port });
    debugLogger.info(`Aztec Server listening on port ${port}`, versions);
  }

  // If there are any admin services, start a separate JSON-RPC server for them
  if (Object.entries(adminServices).length > 0) {
    const adminMiddlewares = [getOtelJsonRpcPropagationMiddleware(), getVersioningMiddleware(versions, versioningOpts)];

    // Resolve the admin API key (auto-generated and persisted, or opt-out)
    const apiKeyResolution = await resolveAdminApiKey(
      {
        adminApiKeyHash: apiConfig.adminApiKeyHash,
        disableAdminApiKey: apiConfig.disableAdminApiKey,
        resetAdminApiKey: apiConfig.resetAdminApiKey,
        dataDirectory: resolvedDataDirectory,
      },
      debugLogger,
    );
    if (apiKeyResolution) {
      adminMiddlewares.unshift(getApiKeyAuthMiddleware(apiKeyResolution.apiKeyHash));
    } else {
      debugLogger.warn('No admin API key set — admin endpoint is unauthenticated');
    }

    const rpcServer = createNamespacedSafeJsonRpcServer(adminServices, {
      http200OnError: false,
      log: debugLogger,
      middlewares: adminMiddlewares,
      maxBatchSize: apiConfig.rpcMaxBatchSize,
      maxBodySizeBytes: apiConfig.rpcMaxBodySize,
    });
    const { port } = await startHttpRpcServer(rpcServer, { apiPrefix: apiConfig.apiPrefix, port: apiConfig.adminPort });
    debugLogger.info(`Aztec Server admin API listening on port ${port}`, versions);

    // Display the API key after the server has started
    // Uses userLog which is never filtered by LOG_LEVEL.
    if (apiKeyResolution?.rawKey) {
      const separator = '='.repeat(70);
      userLog('');
      userLog(separator);
      userLog('  ADMIN API KEY (save this — it will NOT be shown again)');
      userLog('');
      userLog(`  ${apiKeyResolution.rawKey}`);
      userLog('');
      userLog(`  Use via header:  x-api-key: <key>`);
      userLog(`  Or via header:   Authorization: Bearer <key>`);
      if (options.dataDirectory) {
        userLog('');
        userLog('  The key hash has been persisted — on next restart, the same key will be used.');
      }
      userLog('');
      userLog('  To disable admin auth: --disable-admin-api-key or AZTEC_DISABLE_ADMIN_API_KEY=true');
      userLog(separator);
      userLog('');
    }
  }
}
