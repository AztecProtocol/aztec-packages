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
  'b2803ec899f76f6b2ac011480d24028f1a29587f8a3a92f7ee9d48d8c085c284',
  '6bb46e9a80da2ff7bfff71c2c50eaaa4b15f7ed5ad1ade4261b574ef80b0cdb0',
  '0f6addf0da06c33293df974a565b03d1ab096090d907d98055a8b7f4954e120c',
];

const deployInitialAccounts = async (aztecRpc: AztecRPC) => {
  const accounts = initialAccountKeys.map(s => {
    const privateKey = new PrivateKey(Buffer.from(s, 'hex'));
    const account = getSchnorrAccount(aztecRpc, privateKey, PrivateKey.random());
    return {
      account,
      privateKey,
    };
  });
  // Attempt to get as much parallelism as possible
  const deployMethods = await Promise.all(
    accounts.map(async x => {
      const deployMethod = await x.account.getDeployMethod();
      await deployMethod.create({ contractAddressSalt: x.account.salt });
      await deployMethod.simulate({});
      return deployMethod;
    }),
  );
  // Send tx together to try and get them in the same rollup
  const sentTxs = deployMethods.map(dm => {
    return dm.send();
  });
  await Promise.all(
    sentTxs.map(async (tx, i) => {
      const wallet = await accounts[i].account.getWallet();
      return tx.wait({ wallet });
    }),
  );
  return accounts;
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
  const accountStrings = [`Initial Accounts:\n\n`];

  const registeredAccounts = await aztecRpcServer.getAccounts();
  for (const account of accounts) {
    const completedAddress = await account.account.getCompleteAddress();
    if (registeredAccounts.find(a => a.equals(completedAddress.address))) {
      accountStrings.push(` Address: ${completedAddress.address.toString()}\n`);
      accountStrings.push(` Partial Address: ${completedAddress.partialAddress.toString()}\n`);
      accountStrings.push(` Private Key: ${account.privateKey.toString()}\n`);
      accountStrings.push(` Public Key: ${completedAddress.publicKey.toString()}\n\n`);
    }
  }
  logger.info(`${splash}\n${github}\n\n`.concat(...accountStrings));
}

main().catch(err => {
  logger.fatal(err);
  process.exit(1);
});
