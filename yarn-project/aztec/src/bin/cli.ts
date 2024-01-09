import { Archiver, LMDBArchiverStore, createArchiverRpcServer, getConfigEnvVars } from '@aztec/archiver';
import { AztecNodeConfig, createAztecNodeRpcServer, getConfigEnvVars as getNodeConfigEnvVars } from '@aztec/aztec-node';
import { createAztecNodeClient, fileURLToPath } from '@aztec/aztec.js';
import { NULL_KEY } from '@aztec/ethereum';
import { LogFn, createConsoleLogger, createDebugLogger } from '@aztec/foundation/log';
import { openDb } from '@aztec/kv-store';
import { createPXERpcServer, createPXEService, getPXEServiceConfig } from '@aztec/pxe';

import { Command } from 'commander';
import { readFileSync } from 'fs';
import pick from 'lodash.pick';
import { dirname, resolve } from 'path';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

import { MNEMONIC, createAztecNode, createAztecPXE, createSandbox, deployContractsToL1 } from '../sandbox.js';
import { startHttpRpcServer } from '../server.js';

const { AZTEC_NODE_PORT = '80', PXE_PORT = '79', ARCHIVER_PORT = '80' } = process.env;

const debugLogger = createDebugLogger('aztec:cli');

const installSignalHandlers = (logFn: LogFn, cb?: Array<() => Promise<void>>) => {
  const shutdown = async () => {
    logFn('Shutting down...');
    if (cb) {
      await Promise.all(cb);
    }
    process.exit(0);
  };
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
};

/**
 * Parses a string of options into a key-value map.
 * @param options - String of options in the format "option1=value1,option2=value2".
 * @returns Key-value map of options.
 */
const parseModuleOptions = (options: string): Record<string, string> => {
  const optionsArray = options.split(',');
  return optionsArray.reduce((acc, option) => {
    const [key, value] = option.split('=');
    return { ...acc, [key]: value };
  }, {});
};

/**
 * Returns commander program that defines the 'aztec' command line interface.
 * @param userLog - log function for logging user output.
 * @param debugLogger - logger for logging debug messages.
 */
export function getProgram(userLog: LogFn): Command {
  const program = new Command();

  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
  const cliVersion: string = JSON.parse(readFileSync(packageJsonPath).toString()).version;

  program.name('aztec').description('Aztec command line interface').version(cliVersion);

  // Start complete Sandbox.
  program
    .command('sandbox', 'Starts Aztec sandbox')
    .option('-p, --port <port>', 'Port to run sandbox on', AZTEC_NODE_PORT)
    .option('-pp, --pxe-port <port>', 'Port to run PXE on', PXE_PORT)
    .action(async options => {
      const { node, pxe, stop } = await createSandbox();
      installSignalHandlers(stop);

      // Start Node and PXE JSON-RPC servers
      startHttpRpcServer(node, createAztecNodeRpcServer, options.port);
      userLog(`Aztec Node JSON-RPC Server listening on port ${options.port}`);
      if (options.pxePort) {
        startHttpRpcServer(pxe, createPXERpcServer, PXE_PORT);
        userLog(`PXE JSON-RPC Server listening on port ${PXE_PORT}`);
      }
    });

  // Start Aztec modules with options
  program
    .command('start', 'Starts Aztec modules')
    .option('-n, --node [options]', 'Starts Aztec Node with options (e.g. "option1=value1,option2=value2")')
    .option('-p, --pxe [options]', 'Starts Aztec PXE with options (e.g. "option1=value1,option2=value2")')
    .option('-a, --archiver [options]', 'Starts Aztec Archiver attached to node')
    .option('-s, --sequencer [options]', 'Starts Aztec Sequencer attached to node')
    .action(async options => {
      // list of 'stop' functions to call when process ends
      const signalHandlers: Array<() => Promise<void>> = [];

      // Start Aztec Node
      if (options.node) {
        // get env vars first
        const aztecNodeConfigEnvVars = getNodeConfigEnvVars();
        // get config from options
        const nodeCliOptions = parseModuleOptions(options.node);
        // merge env vars and cli options
        const nodeConfig = pick({ ...aztecNodeConfigEnvVars, ...nodeCliOptions }) as AztecNodeConfig;

        // if no publisher private key, then use MNEMONIC
        if (!options.archiver) {
          // expect archiver url in node config
          const archiverUrl = nodeCliOptions.archiverUrl;
          if (!archiverUrl) {
            throw new Error('Archiver Service URL is required to start Aztec Node without --archiver option');
          }
          nodeConfig.archiverUrl = archiverUrl;
        }

        // Deploy contracts if needed
        if (nodeCliOptions.deployContracts) {
          let account;
          if (nodeConfig.publisherPrivateKey === NULL_KEY) {
            account = mnemonicToAccount(MNEMONIC);
          } else {
            account = privateKeyToAccount(nodeConfig.publisherPrivateKey);
          }
          await deployContractsToL1(nodeConfig, account);
        }

        if (!options.sequencer) {
          nodeConfig.disableSequencer = true;
        } else if (nodeConfig.publisherPrivateKey === NULL_KEY) {
          // If we have a sequencer, ensure there's a publisher private key set.
          const hdAccount = mnemonicToAccount(MNEMONIC);
          const privKey = hdAccount.getHdKey().privateKey;
          nodeConfig.publisherPrivateKey = `0x${Buffer.from(privKey!).toString('hex')}`;
        }

        // P2P enabled by default
        nodeConfig.p2pEnabled = nodeCliOptions.p2pDisabled !== 'true';

        // Create and start Aztec Node.
        const node = await createAztecNode(nodeConfig);
        startHttpRpcServer(node, createAztecNodeRpcServer, nodeCliOptions.port || AZTEC_NODE_PORT);
        userLog(`Aztec Node JSON-RPC Server listening on port ${nodeCliOptions.port || AZTEC_NODE_PORT}`);

        // Create a PXE client that connects to the node.
        if (options.pxe) {
          const pxeCliOptions = parseModuleOptions(options.pxe);
          const pxe = await createAztecPXE(node);
          signalHandlers.push(pxe.stop);

          // Start PXE JSON-RPC server.
          startHttpRpcServer(pxe, createPXERpcServer, pxeCliOptions.port || PXE_PORT);
        }

        signalHandlers.push(node.stop);
      } else if (options.pxe) {
        // Starting a PXE with a remote node.
        // get env vars first
        const pxeConfigEnvVars = getPXEServiceConfig();
        // get config from options
        const pxeCliOptions = parseModuleOptions(options.pxe);

        // throw if no Aztec Node URL is provided
        if (!pxeCliOptions.nodeUrl) {
          throw new Error('Aztec Node URL (nodeUrl) option is required to start PXE without --node option');
        }

        // merge env vars and cli options
        const pxeConfig = pick({ ...pxeConfigEnvVars, ...pxeCliOptions });

        const node = createAztecNodeClient(pxeCliOptions.nodeUrl);

        const pxe = await createPXEService(node, pxeConfig);
        signalHandlers.push(pxe.stop);
        // Start PXE JSON-RPC server
        startHttpRpcServer(pxe, createPXERpcServer, pxeCliOptions.port || PXE_PORT);
        userLog(`PXE JSON-RPC Server listening on port ${pxeCliOptions.port || PXE_PORT}`);
      } else if (options.archiver) {
        // Start a standalone archiver.
        // get env vars first
        const archiverConfigEnvVars = getConfigEnvVars();
        // get config from options
        const archiverCliOptions = parseModuleOptions(options.pxe);
        // merge env vars and cli options
        const archiverConfig = pick({ ...archiverConfigEnvVars, ...archiverCliOptions });

        const [nodeDb] = await openDb(archiverConfig, debugLogger);
        const archiverStore = new LMDBArchiverStore(nodeDb, archiverConfig.maxLogs);

        const archiver = await Archiver.createAndSync(archiverConfig, archiverStore, true);
        startHttpRpcServer(archiver, createArchiverRpcServer, archiverCliOptions.port || ARCHIVER_PORT);
      }
      installSignalHandlers(debugLogger, signalHandlers);
    });
  return program;
}

/** CLI main entrypoint */
async function main() {
  const userLog = createConsoleLogger();
  const program = getProgram(userLog);
  await program.parseAsync(process.argv);
}

main().catch(err => {
  debugLogger(`Error in command execution`);
  debugLogger(err);
  process.exit(1);
});
