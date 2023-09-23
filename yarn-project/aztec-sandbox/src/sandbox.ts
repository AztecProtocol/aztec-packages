#!/usr/bin/env -S node --no-warnings
import { AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { EthAddress, createAztecRPCServer, getConfigEnvVars as getRpcConfigEnvVars } from '@aztec/aztec-rpc';
import { DeployL1Contracts, createEthereumChain, deployL1Contracts } from '@aztec/ethereum';
import { createDebugLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import {
  Account,
  Chain,
  HDAccount,
  HttpTransport,
  createPublicClient,
  createWalletClient,
  http,
  http as httpViemTransport,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

const {
  MNEMONIC = 'test test test test test test test test test test test junk',
  OUTBOX_CONTRACT_ADDRESS = '',
  REGISTRY_CONTRACT_ADDRESS = '',
} = process.env;

const logger = createDebugLogger('aztec:sandbox');

const localAnvil = foundry;

/**
 * Helper function that retrieves the addresses of configured deployed contracts.
 */
function retrieveL1Contracts(config: AztecNodeConfig, account: Account): Promise<DeployL1Contracts> {
  const chain = createEthereumChain(config.rpcUrl, config.apiKey);
  const walletClient = createWalletClient<HttpTransport, Chain, HDAccount>({
    account,
    chain: chain.chainInfo,
    transport: http(chain.rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: http(chain.rpcUrl),
  });
  const contracts: DeployL1Contracts = {
    l1ContractAddresses: {
      rollupAddress: config.rollupAddress,
      registryAddress: EthAddress.fromString(REGISTRY_CONTRACT_ADDRESS),
      inboxAddress: config.inboxAddress,
      outboxAddress: EthAddress.fromString(OUTBOX_CONTRACT_ADDRESS),
      contractDeploymentEmitterAddress: config.contractDeploymentEmitterAddress,
      decoderHelperAddress: undefined,
    },
    walletClient,
    publicClient,
  };
  return Promise.resolve(contracts);
}

/**
 * Helper function that waits for the Ethereum RPC server to respond before deploying L1 contracts.
 */
async function waitThenDeploy(config: AztecNodeConfig, deployFunction: () => Promise<DeployL1Contracts>) {
  const chain = createEthereumChain(config.rpcUrl, config.apiKey);
  // wait for ETH RPC to respond to a request.
  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: httpViemTransport(chain.rpcUrl),
  });
  const chainID = await retryUntil(
    async () => {
      let chainId = 0;
      try {
        chainId = await publicClient.getChainId();
      } catch (err) {
        logger.warn(`Failed to connect to Ethereum node at ${chain.rpcUrl}. Retrying...`);
      }
      return chainId;
    },
    'isEthRpcReady',
    600,
    1,
  );

  if (!chainID) {
    throw Error(`Ethereum node unresponsive at ${chain.rpcUrl}.`);
  }

  // Deploy L1 contracts
  return await deployFunction();
}

/** Sandbox settings. */
export type SandboxConfig = AztecNodeConfig & {
  /** Mnemonic used to derive the L1 deployer private key.*/
  l1Mnemonic: string;
};

/**
 * Create and start a new Aztec Node and RPC Server. Deploys L1 contracts.
 * Does not start any HTTP services nor populate any initial accounts.
 * @param config - Optional Sandbox settings.
 */
export async function createSandbox(config: Partial<SandboxConfig> = {}) {
  const aztecNodeConfig: AztecNodeConfig = { ...getConfigEnvVars(), ...config };
  const rpcConfig = getRpcConfigEnvVars();
  const hdAccount = mnemonicToAccount(config.l1Mnemonic ?? MNEMONIC);
  const privKey = hdAccount.getHdKey().privateKey;

  const l1Contracts = await waitThenDeploy(aztecNodeConfig, () =>
    deployL1Contracts(aztecNodeConfig.rpcUrl, hdAccount, localAnvil, logger),
  );
  aztecNodeConfig.publisherPrivateKey = `0x${Buffer.from(privKey!).toString('hex')}`;
  aztecNodeConfig.rollupAddress = l1Contracts.l1ContractAddresses.rollupAddress;
  aztecNodeConfig.contractDeploymentEmitterAddress = l1Contracts.l1ContractAddresses.contractDeploymentEmitterAddress;
  aztecNodeConfig.inboxAddress = l1Contracts.l1ContractAddresses.inboxAddress;

  const node = await AztecNodeService.createAndSync(aztecNodeConfig);
  const rpcServer = await createAztecRPCServer(node, rpcConfig);

  const stop = async () => {
    await rpcServer.stop();
    await node.stop();
  };

  return { node, rpcServer, l1Contracts, stop };
}

/**
 * Create and start a new Aztec Node and RPC Server. Designed for interaction with a node network.
 * Does not start any HTTP services nor populate any initial accounts.
 * @param config - Optional Sandbox settings.
 */
export async function createP2PSandbox() {
  const aztecNodeConfig: AztecNodeConfig = { ...getConfigEnvVars() };
  const rpcConfig = getRpcConfigEnvVars();
  const privateKeyAccount = privateKeyToAccount(aztecNodeConfig.publisherPrivateKey);

  const l1Contracts = await waitThenDeploy(aztecNodeConfig, () =>
    retrieveL1Contracts(aztecNodeConfig, privateKeyAccount),
  );
  aztecNodeConfig.rollupAddress = l1Contracts.l1ContractAddresses.rollupAddress;
  aztecNodeConfig.contractDeploymentEmitterAddress = l1Contracts.l1ContractAddresses.contractDeploymentEmitterAddress;
  aztecNodeConfig.inboxAddress = l1Contracts.l1ContractAddresses.inboxAddress;

  const node = await AztecNodeService.createAndSync(aztecNodeConfig);
  const rpcServer = await createAztecRPCServer(node, rpcConfig);

  const stop = async () => {
    await rpcServer.stop();
    await node.stop();
  };

  return { node, rpcServer, l1Contracts, stop };
}
