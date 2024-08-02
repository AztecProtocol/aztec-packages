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
  defaultValue: string | undefined;
  envVar: string | undefined;
}

// Define categories and options
const categories: { [key: string]: Option[] } = {
  ETHEREUM: [
    {
      flag: '--l1-rpc-url <value>',
      description: 'URL of the Ethereum RPC node',
      defaultValue: 'http://localhost:8545',
      envVar: 'ETHEREUM_HOST',
    },
    {
      flag: '--l1-chain-id <value>',
      description: 'The L1 chain ID',
      defaultValue: '1337',
      envVar: 'L1_CHAIN_ID',
    },
  ],
  'L1 CONTRACT ADDRESSES': [
    {
      flag: '--rolup-address <value>',
      description: 'The deployed L1 rollup contract address',
      defaultValue: undefined,
      envVar: 'ROLUP_CONTRACT_ADDRESS',
    },
    {
      flag: '--registry-address <value>',
      description: 'The deployed L1 registry contract address',
      defaultValue: undefined,
      envVar: 'REGISTRY_CONTRACT_ADDRESS',
    },
    {
      flag: '--inbox-address <value>',
      description: 'The deployed L1 -> L2 inbox contract address',
      defaultValue: undefined,
      envVar: 'INBOX_CONTRACT_ADDRESS',
    },
    {
      flag: '--outbox-address <value>',
      description: 'The deployed L2 -> L1 outbox contract address',
      defaultValue: undefined,
      envVar: 'OUTBOX_CONTRACT_ADDRESS',
    },
    {
      flag: '--availability-oracle-address <value>',
      description: 'The deployed L1 availability oracle contract address',
      defaultValue: undefined,
      envVar: 'AVAILABILITY_ORACLE_CONTRACT_ADDRESS',
    },
    {
      flag: '--gas-token-address <value>',
      description: 'The deployed L1 gas token contract address',
      defaultValue: undefined,
      envVar: 'GAS_TOKEN_CONTRACT_ADDRESS',
    },
    {
      flag: '--gas-portal-address <value>',
      description: 'The deployed L1 gas portal contract address',
      defaultValue: undefined,
      envVar: 'GAS_PORTAL_CONTRACT_ADDRESS',
    },
  ],
  'AZTEC NODE': [
    {
      flag: '--node',
      description: 'Starts Aztec Node with options',
      defaultValue: undefined,
      envVar: undefined,
    },
    {
      flag: '--node.p2pEnabled',
      description: 'Enable P2P subsystem',
      defaultValue: 'false',
      envVar: 'P2P_ENABLED',
    },
    // We don't need one for node right? It's only used for the node's archiver (if used)
    // {
    //   flag: '--node.dataDirectory <value>',
    //   description: 'Where to store node data. If not set, will store temporarily',
    //   defaultValue: undefined,
    //   envVar: 'NODE_DATA_DIRECTORY',
    // }
    {
      flag: '--node.deployAztecContracts',
      description: 'Deploys L1 Aztec contracts before starting the node. Needs mnemonic or private key to be set',
      defaultValue: 'false',
      envVar: 'DEPLOY_AZTEC_CONTRACTS',
    },
    {
      flag: '--node.l2QueueSize <value>',
      description: 'Size of queue of L2 blocks to store in world state.',
      defaultValue: '1000',
      envVar: 'L2_QUEUE_SIZE',
    },
    {
      flag: '--node.worldStateBlockCheckIntervalMS <value>',
      description: 'Frequency in which to check for blocks in ms',
      defaultValue: '100',
      envVar: 'WS_BLOCK_CHECK_INTERVAL_MS',
    },
  ],
  PXE: [
    {
      flag: '--pxe',
      description: 'Starts a PXE with options. If started with --node, the PXE will attach to that node',
      defaultValue: undefined,
      envVar: undefined,
    },
    {
      flag: '--pxe.nodeUrl <value>',
      description: 'The URL of the Aztec Node to connect to. Required if not started with --node',
      defaultValue: undefined,
      envVar: 'AZTEC_NODE_URL',
    },
    {
      flag: '--pxe.port <value>',
      description: 'The port on which the PXE should listen for connections',
      defaultValue: '79',
      envVar: 'PXE_PORT',
    },
    {
      flag: '--pxe.l2BlockPollingIntervalMS <value>',
      description: 'The frequency in which to check for blocks in ms',
      defaultValue: '1000',
      envVar: 'PXE_BLOCK_POLLING_INTERVAL_MS',
    },
    {
      flag: '--pxe.l2StartingBlock <value>',
      description: 'The block number from which to start polling',
      defaultValue: '1',
      envVar: 'PXE_L2_STARTING_BLOCK',
    },
    {
      flag: '--pxe.dataDirectory <value>',
      description: 'Where to store PXE data. If not set, will store temporarily',
      defaultValue: undefined,
      envVar: 'PXE_DATA_DIRECTORY',
    },
  ],
};

// Function to add options dynamically
const addOptions = (cmd: Command, options: Option[]) => {
  options.forEach(opt => {
    cmd.option(
      opt.flag,
      `${opt.description} (default: ${opt.defaultValue}) ($${opt.envVar})`,
      process.env[opt.envVar || ''] || opt.defaultValue,
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
    const helpTextLines: string[] = [''];

    Object.keys(categories).forEach(category => {
      helpTextLines.push(`  ${category}`);
      helpTextLines.push('');

      categories[category].forEach(opt => {
        const defaultValueText = opt.defaultValue ? `(default: ${opt.defaultValue})` : '';
        const envVarText = `($${opt.envVar})`;
        const padding = ' '.repeat(Math.max(0, 35 - opt.flag.length - defaultValueText.length));

        helpTextLines.push(`    ${opt.flag} ${defaultValueText}${padding}${envVarText}`);
        helpTextLines.push(`          ${opt.description}`);
        helpTextLines.push('');
      });
    });

    return helpTextLines.join('\n');
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
          userLog(`No module specified to start ${JSON.stringify(options, null, 2)}`);
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
