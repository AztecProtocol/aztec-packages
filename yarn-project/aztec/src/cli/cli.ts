import { deployInitialTestAccounts } from '@aztec/accounts/testing';
import { createAztecNodeRpcServer } from '@aztec/aztec-node';
import { type ServerList, createNamespacedJsonRpcServer, createStatusRouter } from '@aztec/foundation/json-rpc/server';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';
import { createPXERpcServer } from '@aztec/pxe';

import { Command } from 'commander';
import http from 'http';

import { createSandbox } from '../sandbox.js';
import { github, splash } from '../splash.js';
import { cliTexts } from './texts.js';
import { createAccountLogs, installSignalHandlers } from './util.js';

const { AZTEC_PORT = '8080', API_PREFIX = '', TEST_ACCOUNTS = 'true', ENABLE_GAS = '' } = process.env;

// Define an interface for options
interface Option {
  flag: string;
  description: string;
  defaultValue: string;
  envVar: string;
}

// Define categories and options
const categories: { [key: string]: Option[] } = {
  'TRANSACTION POOL (BLOB)': [
    {
      flag: '--blobpool.datacap <value>',
      description: 'Disk space to allocate for pending blob transactions (soft limit)',
      defaultValue: '2684354560',
      envVar: 'GETH_BLOBPOOL_DATACAP',
    },
    {
      flag: '--blobpool.datadir <value>',
      description: 'Data directory to store blob transactions in',
      defaultValue: 'blobpool',
      envVar: 'GETH_BLOBPOOL_DATADIR',
    },
    {
      flag: '--blobpool.pricebump <value>',
      description: 'Price bump percentage to replace an already existing blob transaction',
      defaultValue: '100',
      envVar: 'GETH_BLOBPOOL_PRICEBUMP',
    },
  ],
  'TRANSACTION POOL (EVM)': [
    {
      flag: '--txpool.accountqueue <value>',
      description: 'Maximum number of non-executable transaction slots permitted per account',
      defaultValue: '64',
      envVar: 'GETH_TXPOOL_ACCOUNTQUEUE',
    },
    {
      flag: '--txpool.accountslots <value>',
      description: 'Minimum number of executable transaction slots guaranteed per account',
      defaultValue: '16',
      envVar: 'GETH_TXPOOL_ACCOUNTSLOTS',
    },
  ],
};

// Function to add options dynamically
const addOptions = (cmd: Command, options: Option[]) => {
  options.forEach(opt => {
    cmd.option(
      opt.flag,
      `${opt.description} (default: ${opt.defaultValue}) ($${opt.envVar})`,
      process.env[opt.envVar] || opt.defaultValue,
    );
  });
};

export function injectFooCommands(program: Command, userLog: LogFn) {
  // const fooCmd = program.command('foo').description('Foo Description');
  const fooCmd = new Command('foo').description('Foo Description');

  // Assuming commands are added elsewhere, here we just add options to the main program
  Object.keys(categories).forEach(category => {
    addOptions(fooCmd, categories[category]);
  });

  // fooCmd.on('--help', () => {
  fooCmd.helpInformation = () => {
    let helpText = '\n';
    Object.keys(categories).forEach(category => {
      helpText += `  ${category}\n\n`;
      categories[category].forEach(opt => {
        helpText += `    ${opt.flag}         (default: ${opt.defaultValue})              ($${opt.envVar})\n`;
        helpText += `          ${opt.description}\n\n`;
      });
    });
    return helpText;
  };

  program.addCommand(fooCmd);
  return program;
}

/**
 * Returns commander program that defines the 'aztec' command line interface.
 * @param userLog - log function for logging user output.
 * @param debugLogger - logger for logging debug messages.
 */
export function injectAztecCommands(program: Command, userLog: LogFn, debugLogger: DebugLogger) {
  // Start Aztec modules with options
  program
    .command('start')
    .description(
      'Starts Aztec modules. Options for each module can be set as key-value pairs (e.g. "option1=value1,option2=value2") or as environment variables.',
    )
    .option('-sb, --sandbox', 'Starts Aztec Sandbox.')
    .option('-p, --port <port>', 'Port to run Aztec on.', AZTEC_PORT)
    .option('-n, --node [options]', cliTexts.node)
    .option('-px, --pxe [options]', cliTexts.pxe)
    .option('-a, --archiver [options]', cliTexts.archiver)
    .option('-s, --sequencer [options]', cliTexts.sequencer)
    .option('-r, --prover [options]', cliTexts.proverAgent)
    .option('-o, --prover-node [options]', cliTexts.proverNode)
    .option('-p2p, --p2p-bootstrap [options]', cliTexts.p2pBootstrap)
    .option('-t, --txe [options]', cliTexts.txe)
    .option('--bot [options]', cliTexts.bot)
    .action(async options => {
      // list of 'stop' functions to call when process ends
      const signalHandlers: Array<() => Promise<void>> = [];
      let services: ServerList = [];

      if (options.sandbox) {
        userLog(`${splash}\n${github}\n\n`);
        userLog(`Setting up Aztec Sandbox, please stand by...`);
        const { aztecNodeConfig, node, pxe, stop } = await createSandbox({
          enableGas: ['true', '1'].includes(ENABLE_GAS),
        });

        // Deploy test accounts by default
        if (TEST_ACCOUNTS === 'true') {
          if (aztecNodeConfig.p2pEnabled) {
            userLog(`Not setting up test accounts as we are connecting to a network`);
          } else {
            userLog('Setting up test accounts...');
            const accounts = await deployInitialTestAccounts(pxe);
            const accLogs = await createAccountLogs(accounts, pxe);
            userLog(accLogs.join(''));
          }
        }

        // Start Node and PXE JSON-RPC server
        const nodeServer = createAztecNodeRpcServer(node);
        const pxeServer = createPXERpcServer(pxe);
        signalHandlers.push(stop);
        services = [{ node: nodeServer }, { pxe: pxeServer }];
      } else {
        if (options.node) {
          const { startNode } = await import('./cmds/start_node.js');
          services = await startNode(options, signalHandlers, userLog);
        } else if (options.bot) {
          const { startBot } = await import('./cmds/start_bot.js');
          services = await startBot(options, signalHandlers, userLog);
        } else if (options.proverNode) {
          const { startProverNode } = await import('./cmds/start_prover_node.js');
          services = await startProverNode(options, signalHandlers, userLog);
        } else if (options.pxe) {
          const { startPXE } = await import('./cmds/start_pxe.js');
          services = await startPXE(options, signalHandlers, userLog);
        } else if (options.archiver) {
          const { startArchiver } = await import('./cmds/start_archiver.js');
          services = await startArchiver(options, signalHandlers);
        } else if (options.p2pBootstrap) {
          const { startP2PBootstrap } = await import('./cmds/start_p2p_bootstrap.js');
          await startP2PBootstrap(options, userLog, debugLogger);
        } else if (options.prover) {
          const { startProverAgent } = await import('./cmds/start_prover_agent.js');
          services = await startProverAgent(options, signalHandlers, userLog);
        } else if (options.txe) {
          const { startTXE } = await import('./cmds/start_txe.js');
          startTXE(options, debugLogger);
        } else if (options.sequencer) {
          userLog(`Cannot run a standalone sequencer without a node`);
          process.exit(1);
        } else {
          userLog(`No module specified to start`);
          process.exit(1);
        }
      }
      installSignalHandlers(debugLogger.info, signalHandlers);

      if (services.length) {
        const rpcServer = createNamespacedJsonRpcServer(services, debugLogger);

        const app = rpcServer.getApp(API_PREFIX);
        // add status route
        const statusRouter = createStatusRouter(API_PREFIX);
        app.use(statusRouter.routes()).use(statusRouter.allowedMethods());

        const httpServer = http.createServer(app.callback());
        httpServer.listen(options.port);
        userLog(`Aztec Server listening on port ${options.port}`);
      }
    });

  program.configureHelp({ sortSubcommands: true });

  program.addHelpText(
    'after',
    `

  Additional commands:

    test [options]: starts a dockerized TXE node via
      $ aztec start --txe
    then runs
      $ aztec-nargo test --silence-warnings --oracle-resolver=<TXE_ADDRESS> [options]
    `,
  );

  return program;
}
