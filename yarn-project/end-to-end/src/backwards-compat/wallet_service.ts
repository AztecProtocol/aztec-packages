#!/usr/bin/env -S node --no-warnings
/**
 * Standalone entrypoint that spins up a local Aztec network (L1 + node) and exposes a {@link NodeEmbeddedWallet} over
 * JSON-RPC.
 *
 * Intended for forward-compatibility testing: an **old** release image runs this script so that **new** tests can send
 * new artifacts to old runtime code (loadContractArtifact, ACIR simulator, class-ID computation, entrypoint encoding,
 * etc.).
 */
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { createLocalNetwork } from '@aztec/aztec';
import { WalletSchema } from '@aztec/aztec.js/wallet';
import { createNamespacedSafeJsonRpcServer, startHttpRpcServer } from '@aztec/foundation/json-rpc/server';
import { createLogger } from '@aztec/foundation/log';
import { AztecNodeApiSchema } from '@aztec/stdlib/interfaces/client';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

const logger = createLogger('wallet-service');

const { ETHEREUM_HOSTS = 'http://localhost:8545', NODE_PORT = '8080', WALLET_PORT = '8081' } = process.env;

async function main() {
  const l1RpcUrls = ETHEREUM_HOSTS.split(',').map(url => url.trim());

  logger.info('Starting wallet service...', { l1RpcUrls });

  // createLocalNetwork deploys L1 contracts, starts the node, and optionally deploys funded test accounts (when
  // TEST_ACCOUNTS=true via env).
  const { node, stop: stopNetwork } = await createLocalNetwork({ l1RpcUrls, realProofs: false }, logger.info);

  // Create an ephemeral embedded wallet backed by the local node.
  const wallet = await EmbeddedWallet.create(node, { ephemeral: true });

  // Re-register the initial test accounts so they are available via wallet.getAccounts(). createLocalNetwork deploys
  // them onchain but uses a temporary wallet that is then stopped.
  //
  // We use the non-lazy import path (@aztec/accounts/testing, not /lazy) to avoid the dynamic JSON import that is
  // incompatible with Node.js import attribute enforcement.
  const testAccountsData = await getInitialTestAccountsData();
  const accounts = await Promise.all(
    testAccountsData.map(({ secret, salt, signingKey }) => wallet.createSchnorrAccount(secret, salt, signingKey)),
  );
  logger.info('Embedded wallet created', { accounts: accounts.map(a => a.address.toString()) });

  // Contract artifacts are large, so allow generous body sizes for RPC requests.
  const rpcOptions = { maxBodySizeBytes: '50mb' };

  // Serve node RPC
  const nodeRpcServer = createNamespacedSafeJsonRpcServer({ node: [node, AztecNodeApiSchema] }, rpcOptions);
  const nodeHttpServer = await startHttpRpcServer(nodeRpcServer, { port: NODE_PORT });
  logger.info(`Node JSON-RPC server listening on port ${nodeHttpServer.port}`);

  // Serve wallet RPC
  const walletRpcServer = createNamespacedSafeJsonRpcServer({ wallet: [wallet, WalletSchema] }, rpcOptions);
  const walletHttpServer = await startHttpRpcServer(walletRpcServer, { port: WALLET_PORT });
  logger.info(`Wallet JSON-RPC server listening on port ${walletHttpServer.port}`);

  const shutdown = async () => {
    logger.info('Shutting down...');
    nodeHttpServer.close();
    walletHttpServer.close();
    await wallet.stop();
    await stopNetwork();
    process.exit(0);
  };

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once('SIGINT', shutdown);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once('SIGTERM', shutdown);
}

main().catch(err => {
  logger.error('Wallet service failed to start', err);
  process.exit(1);
});
