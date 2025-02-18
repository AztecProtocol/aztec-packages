import { AztecNodeApiSchema, PXESchema, getVersioningMiddleware } from '@aztec/circuit-types';
import { type ChainConfig } from '@aztec/circuit-types/config';
import {
  type NamespacedApiHandlers,
  createNamespacedSafeJsonRpcServer,
  startHttpRpcServer,
} from '@aztec/foundation/json-rpc/server';
import { type LogFn, type Logger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';
import { getOtelJsonRpcPropagationMiddleware } from '@aztec/telemetry-client';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { createSandbox } from '../sandbox.js';
import { github, splash } from '../splash.js';
import { extractNamespacedOptions, installSignalHandlers } from './util.js';
import { getVersions } from './versioning.js';

const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
const cliVersion: string = JSON.parse(readFileSync(packageJsonPath).toString()).version;

export async function aztecStart(options: any, userLog: LogFn, debugLogger: Logger) {
  // list of 'stop' functions to call when process ends
  const signalHandlers: Array<() => Promise<void>> = [];
  const services: NamespacedApiHandlers = {};
  let config: ChainConfig | undefined = undefined;

  if (options.sandbox) {
    const sandboxOptions = extractNamespacedOptions(options, 'sandbox');
    const nodeOptions = extractNamespacedOptions(options, 'node');
    userLog(`${splash}\n${github}\n\n`);
    userLog(`Setting up Aztec Sandbox ${cliVersion}, please stand by...`);

    const { node, pxe, stop } = await createSandbox(
      {
        l1Mnemonic: options.l1Mnemonic,
        l1RpcUrl: options.l1RpcUrl,
        l1Salt: nodeOptions.deployAztecContractsSalt,
        noPXE: sandboxOptions.noPXE,
        testAccounts: sandboxOptions.testAccounts,
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
      ({ config } = await startNode(options, signalHandlers, services, userLog));
    } else if (options.proofVerifier) {
      const { startProofVerifier } = await import('./cmds/start_proof_verifier.js');
      await startProofVerifier(options, signalHandlers, userLog);
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
  if (Object.entries(services).length > 0) {
    const rpcServer = createNamespacedSafeJsonRpcServer(services, {
      http200OnError: false,
      log: debugLogger,
      middlewares: [getOtelJsonRpcPropagationMiddleware(), getVersioningMiddleware(versions)],
    });
    const { port } = await startHttpRpcServer(rpcServer, { port: options.port });
    debugLogger.info(`Aztec Server listening on port ${port}`, versions);
  }
}
