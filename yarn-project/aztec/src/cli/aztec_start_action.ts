import { getActiveNetworkName } from '@aztec/foundation/config';
import {
  type NamespacedApiHandlers,
  createNamespacedSafeJsonRpcServer,
  getApiKeyAuthMiddleware,
  startHttpRpcServer,
} from '@aztec/foundation/json-rpc/server';
import type { LogFn, Logger } from '@aztec/foundation/log';
import type { ChainConfig } from '@aztec/stdlib/config';
import {
  AztecNodeAdminApiSchema,
  AztecNodeApiSchema,
  AztecNodeDebugApiSchema,
  addLegacyNodeRpcNamespaces,
} from '@aztec/stdlib/interfaces/client';
import { P2PApiSchema } from '@aztec/stdlib/interfaces/server';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import { getVersioningMiddleware } from '@aztec/stdlib/versioning';
import { getOtelJsonRpcDiagnosticsMiddleware, getOtelJsonRpcPropagationMiddleware } from '@aztec/telemetry-client';

import { createLocalNetwork } from '../local-network/index.js';
import { github, splash } from '../splash.js';
import { resolveAdminApiKey } from './admin_api_key_store.js';
import { extractNamespacedOptions, installSignalHandlers } from './util.js';
import { getVersions } from './versioning.js';

export async function aztecStart(options: any, userLog: LogFn, debugLogger: Logger) {
  // list of 'stop' functions to call when process ends
  const signalHandlers: Array<() => Promise<void>> = [];
  const services: NamespacedApiHandlers = {};
  const adminServices: NamespacedApiHandlers = {};
  const packageVersion = getPackageVersion();
  let config: ChainConfig | undefined = undefined;

  if (options.localNetwork) {
    const localNetwork = extractNamespacedOptions(options, 'localNetwork');
    userLog(`${splash}\n${github}\n\n`);
    userLog(`Setting up Aztec local network ${packageVersion}, please stand by...`);

    const { node, stop } = await createLocalNetwork(
      {
        l1Mnemonic: localNetwork.l1Mnemonic,
        l1RpcUrls: options.l1RpcUrls,
        testAccounts: localNetwork.testAccounts,
        realProofs: false,
        // Setting the epoch duration to 2 by default for local network. This allows the epoch to be "proven" faster, so
        // the users can consume out hash without having to wait for a long time.
        // Note: We are not proving anything in the local network (realProofs == false). But in `createLocalNetwork`,
        // the EpochTestSettler will set the out hash to the outbox when an epoch is complete.
        aztecEpochDuration: 2,
      },
      userLog,
    );

    // Start Node and PXE JSON-RPC server
    signalHandlers.push(stop);
    services.aztec = [node, AztecNodeApiSchema];
    services.p2p = [node.getP2P(), P2PApiSchema];
    adminServices.aztecAdmin = [node, AztecNodeAdminApiSchema];
    services.aztecDebug = [node, AztecNodeDebugApiSchema];
  } else {
    // Route --prover-node through startNode
    if (options.proverNode && !options.node) {
      options.node = true;
    }

    if (options.node) {
      const { startNode } = await import('./cmds/start_node.js');
      const networkName = getActiveNetworkName(options.network);
      ({ config } = await startNode(options, signalHandlers, services, adminServices, userLog, networkName));
      if (options.nodeDebug && services.aztec) {
        services.aztecDebug = [services.aztec[0], AztecNodeDebugApiSchema];
      }
    } else if (options.bot) {
      const { startBot } = await import('./cmds/start_bot.js');
      await startBot(options, signalHandlers, services, userLog);
    } else if (options.p2pBootstrap) {
      const { startP2PBootstrap } = await import('./cmds/start_p2p_bootstrap.js');
      ({ config } = await startP2PBootstrap(options, signalHandlers, services, userLog));
    } else if (options.proverAgent) {
      const { startProverAgent } = await import('./cmds/start_prover_agent.js');
      await startProverAgent(options, signalHandlers, services, userLog);
    } else if (options.proverBroker) {
      const { startProverBroker } = await import('./cmds/start_prover_broker.js');
      await startProverBroker(options, signalHandlers, services, userLog);
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

  addLegacyNodeRpcNamespaces(services, adminServices);

  // Start the main JSON-RPC server
  if (Object.entries(services).length > 0) {
    if (services.aztec) {
      const { BarretenbergSync } = await import('@aztec/bb.js');
      // JSON-RPC schema parsing may decompress compressed Chonk proofs before the node handler runs.
      await BarretenbergSync.initSingleton();
    }

    const rpcServer = createNamespacedSafeJsonRpcServer(services, {
      diagnostic: getOtelJsonRpcDiagnosticsMiddleware(),
      http200OnError: false,
      log: debugLogger,
      middlewares: [getOtelJsonRpcPropagationMiddleware(), getVersioningMiddleware(versions, versioningOpts)],
      maxBatchSize: options.rpcMaxBatchSize,
      maxBodySizeBytes: options.rpcMaxBodySize,
    });
    const { port } = await startHttpRpcServer(rpcServer, { port: options.port });
    debugLogger.info(`Aztec Server listening on port ${port}`, versions);
  }

  // If there are any admin services, start a separate JSON-RPC server for them
  if (Object.entries(adminServices).length > 0) {
    const adminMiddlewares = [getOtelJsonRpcPropagationMiddleware(), getVersioningMiddleware(versions, versioningOpts)];

    // Resolve the admin API key (auto-generated and persisted, or opt-out)
    const apiKeyResolution = await resolveAdminApiKey(
      {
        adminApiKeyHash: options.adminApiKeyHash,
        disableAdminApiKey: options.disableAdminApiKey,
        resetAdminApiKey: options.resetAdminApiKey,
        dataDirectory: options.dataDirectory,
      },
      debugLogger,
    );
    if (apiKeyResolution) {
      adminMiddlewares.unshift(getApiKeyAuthMiddleware(apiKeyResolution.apiKeyHash));
    } else {
      debugLogger.warn('No admin API key set — admin endpoint is unauthenticated');
    }

    const rpcServer = createNamespacedSafeJsonRpcServer(adminServices, {
      diagnostic: getOtelJsonRpcDiagnosticsMiddleware(),
      http200OnError: false,
      log: debugLogger,
      middlewares: adminMiddlewares,
      maxBatchSize: options.rpcMaxBatchSize,
      maxBodySizeBytes: options.rpcMaxBodySize,
    });
    const { port } = await startHttpRpcServer(rpcServer, { port: options.adminPort });
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
