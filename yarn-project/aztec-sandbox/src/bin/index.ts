#!/usr/bin/env -S node --no-warnings
import { createAztecNodeRpcServer, getConfigEnvVars as getNodeConfigEnvVars } from '@aztec/aztec-node';
import { AccountManager, createAztecNodeClient, deployInitialSandboxAccounts } from '@aztec/aztec.js';
import { NULL_KEY } from '@aztec/ethereum';
import { createDebugLogger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';
import { NoirWasmVersion } from '@aztec/noir-compiler/versions';
import { BootstrapNode, getP2PConfigEnvVars } from '@aztec/p2p';
import { GrumpkinScalar, PXEService, createPXERpcServer } from '@aztec/pxe';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { mnemonicToAccount } from 'viem/accounts';

import { setupFileDebugLog } from '../logging.js';
import { MNEMONIC, createAztecNode, createAztecPXE, createSandbox, deployContractsToL1 } from '../sandbox.js';
import { startHttpRpcServer } from '../server.js';
import { github, splash } from '../splash.js';

/**
 * The mode in which the sandbox should be run.
 */
enum SandboxMode {
  Sandbox = 'sandbox',
  Node = 'node',
  PXE = 'pxe',
  P2PBootstrap = 'p2p-bootstrap',
}

const {
  AZTEC_NODE_URL = 'http://localhost:8079',
  AZTEC_NODE_PORT = 8079,
  PXE_PORT = 8080,
  MODE = 'sandbox',
  TEST_ACCOUNTS = 'true',
  DEPLOY_AZTEC_CONTRACTS = 'true',
} = process.env;

const logger = createDebugLogger(`aztec:${MODE}`);

/**
 * Creates the sandbox from provided config and deploys any initial L1 and L2 contracts
 */
async function createAndInitialiseSandbox(deployTestAccounts: boolean) {
  const { aztecNodeConfig, node, pxe, stop } = await createSandbox();
  if (aztecNodeConfig.p2pEnabled) {
    logger.info(`Not setting up test accounts as we are connecting to a network`);
    return {
      aztecNodeConfig,
      pxe,
      node,
      stop,
      accounts: [],
    };
  }
  let accounts;
  if (deployTestAccounts) {
    logger.info('Setting up test accounts...');
    accounts = await deployInitialSandboxAccounts(pxe);
  }
  return {
    aztecNodeConfig,
    pxe,
    node,
    stop,
    accounts,
  };
}

/**
 * Create and start a new Aztec RPC HTTP Server
 */
async function main() {
  const deployTestAccounts = TEST_ACCOUNTS === 'true';
  const deployAztecContracts = DEPLOY_AZTEC_CONTRACTS === 'true';

  const mode = MODE as SandboxMode;

  const createShutdown = (cb?: () => Promise<void>) => async () => {
    logger.info('Shutting down...');
    if (cb) {
      await cb();
    }
    process.exit(0);
  };

  let shutdown: () => Promise<void>;

  const logStrings = [];

  const logPath = setupFileDebugLog();
  logger.info(`Debug logs will be written to ${logPath}`);

  // Get Sandbox version
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
  const version = JSON.parse(readFileSync(packageJsonPath).toString()).version;

  // Code path for starting Sandbox
  if (mode === SandboxMode.Sandbox) {
    logger.info(`Setting up Aztec Sandbox v${version} (noir v${NoirWasmVersion}), please stand by...`);

    const { pxe, node, stop, accounts } = await createAndInitialiseSandbox(deployTestAccounts);

    // Create shutdown cleanup function
    shutdown = createShutdown(stop);

    // Start Node and PXE JSON-RPC servers
    startHttpRpcServer(node, createAztecNodeRpcServer, AZTEC_NODE_PORT);
    logger.info(`Aztec Node JSON-RPC Server listening on port ${AZTEC_NODE_PORT}`);
    startHttpRpcServer(pxe, createPXERpcServer, PXE_PORT);
    logger.info(`PXE JSON-RPC Server listening on port ${PXE_PORT}`);

    // Log initial accounts details
    if (accounts?.length) {
      const accountLogStrings = await createAccountLogs(accounts, pxe);
      logStrings.push(...accountLogStrings);
    }
    logStrings.push(`Aztec Sandbox v${version} (noir v${NoirWasmVersion}) is now ready for use!`);
  } else if (mode === SandboxMode.Node) {
    // Code path for starting Node only
    const nodeConfig = getNodeConfigEnvVars();
    const hdAccount = mnemonicToAccount(MNEMONIC);

    // Deploy L1 Aztec Contracts if needed
    if (deployAztecContracts) {
      await deployContractsToL1(nodeConfig, hdAccount);
      if (nodeConfig.publisherPrivateKey === NULL_KEY) {
        const privKey = hdAccount.getHdKey().privateKey;
        nodeConfig.publisherPrivateKey = `0x${Buffer.from(privKey!).toString('hex')}`;
      }
    }

    const node = await createAztecNode(nodeConfig);
    shutdown = createShutdown(node.stop);

    // Start Node JSON-RPC server
    startHttpRpcServer(node, createAztecNodeRpcServer, 8080); // Use standard 8080 when no PXE is running
    logStrings.push(
      `Aztec Node v${version} (noir v${NoirWasmVersion}) is now ready for use in port ${AZTEC_NODE_PORT}!`,
    );
  } else if (mode === SandboxMode.PXE) {
    // Code path for starting PXE only

    // Create a Node client to connect to the PXE
    const node = createAztecNodeClient(AZTEC_NODE_URL);

    const pxe = await createAztecPXE(node);
    shutdown = createShutdown(pxe.stop);

    // Start PXE JSON-RPC server
    startHttpRpcServer(pxe, createPXERpcServer, PXE_PORT);

    if (deployTestAccounts) {
      logger.info('Setting up test accounts...');
      const accounts = await deployInitialSandboxAccounts(pxe);
      const accountLogStrings = await createAccountLogs(accounts, pxe);
      logStrings.push(...accountLogStrings);
    }

    logStrings.push(`PXE v${version} (noir v${NoirWasmVersion}) is now ready for use in port ${PXE_PORT}!`);
  } else if (mode === SandboxMode.P2PBootstrap) {
    // Code path for starting a P2P bootstrap node
    const config = getP2PConfigEnvVars();
    const bootstrapNode = new BootstrapNode(logger);
    await bootstrapNode.start(config);
    shutdown = createShutdown(bootstrapNode.stop);
    logStrings.push(
      `Bootstrap P2P node is now ready for use. Listening on: ${config.tcpListenIp}:${config.tcpListenPort}.`,
    );
  } else {
    shutdown = createShutdown();
  }

  // Log startup details
  logger.info(`${splash}\n${github}\n\n`.concat(...logStrings));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
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

main().catch(err => {
  logger.error(err);
  process.exit(1);
});
