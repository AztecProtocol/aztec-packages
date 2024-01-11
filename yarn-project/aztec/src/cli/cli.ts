import { deployInitialTestAccounts } from '@aztec/accounts/testing';
import { Archiver, LMDBArchiverStore, createArchiverRpcServer, getConfigEnvVars } from '@aztec/archiver';
import { AztecNodeConfig, createAztecNodeRpcServer, getConfigEnvVars as getNodeConfigEnvVars } from '@aztec/aztec-node';
import { AccountManager, GrumpkinScalar, createAztecNodeClient, fileURLToPath } from '@aztec/aztec.js';
import { NULL_KEY } from '@aztec/ethereum';
import { startHttpRpcServer } from '@aztec/foundation/json-rpc/server';
import { DebugLogger, LogFn } from '@aztec/foundation/log';
import { openDb } from '@aztec/kv-store';
import { BootstrapNode, P2PConfig, getP2PConfigEnvVars } from '@aztec/p2p';
import { PXEService, PXEServiceConfig, createPXERpcServer, createPXEService, getPXEServiceConfig } from '@aztec/pxe';

import { Command } from 'commander';
import { readFileSync } from 'fs';
import pick from 'lodash.pick';
import { dirname, resolve } from 'path';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

import { MNEMONIC, createAztecNode, createAztecPXE, createSandbox, deployContractsToL1 } from '../sandbox.js';
import { github, splash } from '../splash.js';
import { cliTexts } from './texts.js';

const {
  AZTEC_NODE_PORT = '80',
  PXE_PORT = '79',
  ARCHIVER_PORT = '80',
  AZTEC_NODE_URL,
  DEPLOY_AZTEC_CONTRACTS,
} = process.env;

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
  if (!options?.length) {
    return {};
  }
  const optionsArray = options.split(',');
  return optionsArray.reduce((acc, option) => {
    const [key, value] = option.split('=');
    return { ...acc, [key]: value };
  }, {});
};

const mergeEnvVarsAndCliOptions = <T>(envVars: Record<string, any>, cliOptions: Record<string, string>) => {
  const cliOptionsContracts = {
    rollupAddress: cliOptions.rollupAddress,
    registryAddress: cliOptions.registryAddress,
    inboxAddress: cliOptions.inboxAddress,
    outboxAddress: cliOptions.outboxAddress,
    contractDeploymentEmitterAddress: cliOptions.contractDeploymentEmitterAddress,
  };
  const merged = {
    ...envVars,
    ...cliOptions,
    l1Contracts: {
      ...envVars.l1Contracts,
      ...cliOptionsContracts,
    },
  } as T;
  return merged;
};

/**
 * Returns commander program that defines the 'aztec' command line interface.
 * @param userLog - log function for logging user output.
 * @param debugLogger - logger for logging debug messages.
 */
export function getProgram(userLog: LogFn, debugLogger: DebugLogger): Command {
  const program = new Command();

  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
  const cliVersion: string = JSON.parse(readFileSync(packageJsonPath).toString()).version;

  program.name('aztec').description('Aztec command line interface').version(cliVersion);

  // Start complete Sandbox.
  program
    .command('sandbox')
    .description('Starts Aztec sandbox.')
    .option('-p, --port <port>', 'Port to run sandbox on.', AZTEC_NODE_PORT)
    .option('-pp, --pxe-port <port>', 'Port to run PXE on (optional).')
    .option('-s, --skip-test-accounts', 'DO NOT deploy test accounts.', true)
    // .option()
    .action(async options => {
      userLog(`${splash}\n${github}\n\n`);
      userLog(`Setting up Aztec Sandbox v${cliVersion}, please stand by...`);
      const { aztecNodeConfig, node, pxe, stop } = await createSandbox();
      installSignalHandlers(stop);

      // Deploy test accounts by default
      if (!options.skipTestAccounts) {
        if (aztecNodeConfig.p2pEnabled) {
          userLog(`Not setting up test accounts as we are connecting to a network`);
        } else {
          userLog('Setting up test accounts...');
          const accounts = await deployInitialTestAccounts(pxe);
          const accLogs = await createAccountLogs(accounts, pxe);
          userLog(accLogs.join(''));
        }
      }

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
    .command('start')
    .description(
      'Starts Aztec modules. Options for each module can be set as key-value pairs (e.g. "option1=value1,option2=value2") or as environment variables.',
    )
    .option('-n, --node [options]', cliTexts.node)
    .option('-p, --pxe [options]', cliTexts.pxe)
    .option('-a, --archiver [options]', cliTexts.archiver)
    .option('-s, --sequencer [options]', cliTexts.sequencer)
    .option('-p2p, --p2p-bootstrap', cliTexts.p2pBootstrap)
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
        let nodeConfig = mergeEnvVarsAndCliOptions<AztecNodeConfig>(aztecNodeConfigEnvVars, nodeCliOptions);

        // if no publisher private key, then use MNEMONIC
        if (!options.archiver) {
          // expect archiver url in node config
          const archiverUrl = nodeCliOptions.archiverUrl;
          if (!archiverUrl) {
            throw new Error('Archiver Service URL is required to start Aztec Node without --archiver option');
          }
          nodeConfig.archiverUrl = archiverUrl;
        } else {
          const archiverCliOptions = parseModuleOptions(options.archiver);
          nodeConfig = mergeEnvVarsAndCliOptions<AztecNodeConfig>(aztecNodeConfigEnvVars, archiverCliOptions);
        }

        // Deploy contracts if needed
        if (nodeCliOptions.deployAztecContracts || DEPLOY_AZTEC_CONTRACTS === 'true') {
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

        // Determine node url from options or env vars
        const nodeUrl = pxeCliOptions.nodeUrl || AZTEC_NODE_URL;
        // throw if no Aztec Node URL is provided
        if (!nodeUrl) {
          throw new Error(
            'Aztec Node URL (nodeUrl | AZTEC_NODE_URL) option is required to start PXE without --node option',
          );
        }

        // merge env vars and cli options
        const pxeConfig = mergeEnvVarsAndCliOptions<PXEServiceConfig>(pxeConfigEnvVars, pxeCliOptions);

        // create a node client
        const node = createAztecNodeClient(nodeUrl);

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
      } else if (options.p2pBootstrap) {
        // Start a P2P bootstrap node.
        const envVars = getP2PConfigEnvVars();
        const cliOptions = parseModuleOptions(options.p2pBootstrap);
        const bootstrapNode = new BootstrapNode(debugLogger);
        const config = mergeEnvVarsAndCliOptions<P2PConfig>(envVars, cliOptions);
        await bootstrapNode.start(config);
        signalHandlers.push(bootstrapNode.stop);
      }
      installSignalHandlers(debugLogger, signalHandlers);
    });
  return program;
}

/**
 * Creates logs for the initial accounts
 * @param accounts - The initial accounts
 * @param pxe - A PXE instance to get the registered accounts
 * @returns A string array containing the initial accounts details
 */
async function createAccountLogs(
  accounts: {
    /**
     * The account object
     */
    account: AccountManager;
    /**
     * The private key of the account
     */
    privateKey: GrumpkinScalar;
  }[],
  pxe: PXEService,
) {
  const registeredAccounts = await pxe.getRegisteredAccounts();
  const accountLogStrings = [`Initial Accounts:\n\n`];
  for (const account of accounts) {
    const completeAddress = account.account.getCompleteAddress();
    if (registeredAccounts.find(a => a.equals(completeAddress))) {
      accountLogStrings.push(` Address: ${completeAddress.address.toString()}\n`);
      accountLogStrings.push(` Partial Address: ${completeAddress.partialAddress.toString()}\n`);
      accountLogStrings.push(` Private Key: ${account.privateKey.toString()}\n`);
      accountLogStrings.push(` Public Key: ${completeAddress.publicKey.toString()}\n\n`);
    }
  }
  return accountLogStrings;
}
