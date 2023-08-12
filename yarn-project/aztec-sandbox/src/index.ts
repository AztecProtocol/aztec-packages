import { AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { createAztecRPCServer, getHttpRpcServer, getConfigEnvVars as getRpcConfigEnvVars } from '@aztec/aztec-rpc';
import { AztecRPC, getSchnorrAccount } from '@aztec/aztec.js';
import { PrivateKey } from '@aztec/circuits.js';
import { deployL1Contracts } from '@aztec/ethereum';
import { createDebugLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import http from 'http';
import { HDAccount, createPublicClient, http as httpViemTransport } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createApiRouter } from './routes.js';
import { github, splash } from './splash.js';

const { SERVER_PORT = 8080, MNEMONIC = 'test test test test test test test test test test test junk' } = process.env;

const logger = createDebugLogger('aztec:sandbox');

export const localAnvil = foundry;

const initialAccountKeys = [
  '0d1a80df0436c86889ee9cf52752c59842aae522e1b95b2ae7d6b0714b78b672',
  'd16cada1a22b41f95ae95b676ba6ba4fb0eba37e9caaf5ef7b7b0b90501e5679',
];

const deployInitialAccounts = async (aztecRpc: AztecRPC) => {
  const deployments = initialAccountKeys.map(s => {
    const key = new PrivateKey(Buffer.from(s, 'hex'));
    const account = getSchnorrAccount(aztecRpc, key, PrivateKey.random());
    return account;
  });
  await Promise.all(deployments.map(x => x.waitDeploy()));
  return deployments;
};

/**
 * Helper function that waits for the Ethereum RPC server to respond before deploying L1 contracts.
 */
async function waitThenDeploy(rpcUrl: string, hdAccount: HDAccount) {
  // wait for ETH RPC to respond to a request.
  const publicClient = createPublicClient({
    chain: foundry,
    transport: httpViemTransport(rpcUrl),
  });
  const chainID = await retryUntil(
    async () => {
      let chainId = 0;
      try {
        chainId = await publicClient.getChainId();
      } catch (err) {
        logger(`Failed to get Chain ID. Retrying...`);
      }
      return chainId;
    },
    'isEthRpcReady',
    600,
    1,
  );

  if (!chainID) {
    throw Error(`ETH RPC server unresponsive at ${rpcUrl}.`);
  }

  // Deploy L1 contracts
  const deployedL1Contracts = await deployL1Contracts(rpcUrl, hdAccount, localAnvil, logger);
  return deployedL1Contracts;
}

/**
 * Create and start a new Aztec RCP HTTP Server
 */
async function main() {
  const aztecNodeConfig: AztecNodeConfig = getConfigEnvVars();
  const rpcConfig = getRpcConfigEnvVars();
  const hdAccount = mnemonicToAccount(MNEMONIC);
  const privKey = hdAccount.getHdKey().privateKey;

  const deployedL1Contracts = await waitThenDeploy(aztecNodeConfig.rpcUrl, hdAccount);
  aztecNodeConfig.publisherPrivateKey = new PrivateKey(Buffer.from(privKey!));
  aztecNodeConfig.rollupContract = deployedL1Contracts.rollupAddress;
  aztecNodeConfig.contractDeploymentEmitterContract = deployedL1Contracts.contractDeploymentEmitterAddress;
  aztecNodeConfig.inboxContract = deployedL1Contracts.inboxAddress;

  const aztecNode = await AztecNodeService.createAndSync(aztecNodeConfig);
  const aztecRpcServer = await createAztecRPCServer(aztecNode, rpcConfig);

  logger('Deploying initial accounts...');
  const accounts = await deployInitialAccounts(aztecRpcServer);

  const shutdown = async () => {
    logger('Shutting down...');
    await aztecRpcServer.stop();
    await aztecNode.stop();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  const rpcServer = getHttpRpcServer(aztecRpcServer);

  const app = rpcServer.getApp();
  const apiRouter = createApiRouter(deployedL1Contracts);
  app.use(apiRouter.routes());
  app.use(apiRouter.allowedMethods());

  const httpServer = http.createServer(app.callback());
  httpServer.listen(SERVER_PORT);
  logger.info(`Aztec JSON RPC listening on port ${SERVER_PORT}`);
  logger.info(`${splash}\n${github}\n\n`);

  logger.info(`Initial Accounts:`);
  logger.info('');

  const registeredAccounts = await aztecRpcServer.getAccounts();
  for (const account of accounts) {
    const completedAddress = await account.getCompleteAddress();
    if (registeredAccounts.find(a => a.equals(completedAddress.address))) {
      logger.info(` Address: ${completedAddress.address.toString()}`);
      logger.info(` Partial Address: ${completedAddress.partialAddress.toString()}`);
      logger.info(` Public Key: ${completedAddress.publicKey.toString()}`);
      logger.info('');
    }
  }
}

main().catch(err => {
  logger.fatal(err);
  process.exit(1);
});
