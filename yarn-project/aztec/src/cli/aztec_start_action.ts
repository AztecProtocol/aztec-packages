import {
  type NamespacedApiHandlers,
  createNamespacedSafeJsonRpcServer,
  startHttpRpcServer,
} from '@aztec/foundation/json-rpc/server';
import type { LogFn, Logger } from '@aztec/foundation/log';
import type { ChainConfig } from '@aztec/stdlib/config';
import { AztecNodeApiSchema, PXESchema } from '@aztec/stdlib/interfaces/client';
import { getVersioningMiddleware } from '@aztec/stdlib/versioning';
import { getOtelJsonRpcPropagationMiddleware } from '@aztec/telemetry-client';

import { createSandbox } from '../sandbox/index.js';
import { github, splash } from '../splash.js';
import { getCliVersion } from './release_version.js';
import { extractNamespacedOptions, installSignalHandlers } from './util.js';
import { getVersions } from './versioning.js';

export async function aztecStart(options: any, userLog: LogFn, debugLogger: Logger) {
  // list of 'stop' functions to call when process ends
  const signalHandlers: Array<() => Promise<void>> = [];
  const services: NamespacedApiHandlers = {};
  const adminServices: NamespacedApiHandlers = {};
  let config: ChainConfig | undefined = undefined;

  if (options.sandbox) {
    const cliVersion = getCliVersion();
    const sandboxOptions = extractNamespacedOptions(options, 'sandbox');
    const nodeOptions = extractNamespacedOptions(options, 'node');
    sandboxOptions.testAccounts = true;
    userLog(`${splash}\n${github}\n\n`);
    userLog(`Setting up Aztec Sandbox ${cliVersion}, please stand by...`);

    const { node, pxe, stop } = await createSandbox(
      {
        l1Mnemonic: options.l1Mnemonic,
        l1RpcUrls: options.l1RpcUrls,
        l1Salt: nodeOptions.deployAztecContractsSalt,
        noPXE: sandboxOptions.noPXE,
        testAccounts: sandboxOptions.testAccounts,
        realProofs: false,
      },
      userLog,
    );

    // Start Node and PXE JSON-RPC server
    signalHandlers.push(stop);
    services.node = [node, AztecNodeApiSchema];
    if (!sandboxOptions.noPXE) {
      services.pxe = [pxe, PXESchema];
    } else {
      userLog(`Not exposing PXE API through JSON-RPC server`);
    }
  } else {
    if (options.node) {
      const { startNode } = await import('./cmds/start_node.js');
      ({ config } = await startNode(options, signalHandlers, services, adminServices, userLog));
    } else if (options.bot) {
      const { startBot } = await import('./cmds/start_bot.js');
      await startBot(options, signalHandlers, services, userLog);
    } else if (options.proverNode) {
      const { startProverNode } = await import('./cmds/start_prover_node.js');
      ({ config } = await startProverNode(options, signalHandlers, services, userLog));
    } else if (options.blobSink) {
      const { startBlobSink } = await import('./cmds/start_blob_sink.js');
      await startBlobSink(options, signalHandlers, userLog);
    } else if (options.pxe) {
      const { startPXE } = await import('./cmds/start_pxe.js');
      ({ config } = await startPXE(options, signalHandlers, services, userLog));
    } else if (options.archiver) {
      const { startArchiver } = await import('./cmds/start_archiver.js');
      ({ config } = await startArchiver(options, signalHandlers, services));
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
      await startTXE(options, debugLogger);
    } else if (options.sequencer) {
      userLog(`Cannot run a standalone sequencer without a node`);
      process.exit(1);
    } else if (options.faucet) {
      const { startFaucet } = await import('./cmds/start_faucet.js');
      await startFaucet(options, signalHandlers, services, userLog);
    } else {
      userLog(`No module specified to start`);
      process.exit(1);
    }
  }

  installSignalHandlers(debugLogger.info, signalHandlers);
  const versions = getVersions(config);

  // Start the main JSON-RPC server
  if (Object.entries(services).length > 0) {
    const rpcServer = createNamespacedSafeJsonRpcServer(services, {
      http200OnError: false,
      log: debugLogger,
      middlewares: [getOtelJsonRpcPropagationMiddleware(), getVersioningMiddleware(versions)],
      maxBatchSize: options.rpcMaxBatchSize,
      maxBodySizeBytes: options.rpcMaxBodySize,
    });
    const { port } = await startHttpRpcServer(rpcServer, { port: options.port });
    debugLogger.info(`Aztec Server listening on port ${port}`, versions);
  }

  // If there are any admin services, start a separate JSON-RPC server for them
  if (Object.entries(adminServices).length > 0) {
    const rpcServer = createNamespacedSafeJsonRpcServer(adminServices, {
      http200OnError: false,
      log: debugLogger,
      middlewares: [getOtelJsonRpcPropagationMiddleware(), getVersioningMiddleware(versions)],
      maxBatchSize: options.rpcMaxBatchSize,
      maxBodySizeBytes: options.rpcMaxBodySize,
    });
    const { port } = await startHttpRpcServer(rpcServer, { port: options.adminPort });
    debugLogger.info(`Aztec Server admin API listening on port ${port}`, versions);
  }
}
