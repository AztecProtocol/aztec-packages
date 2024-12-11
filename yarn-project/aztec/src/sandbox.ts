#!/usr/bin/env -S node --no-warnings
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { AnvilTestWatcher, EthCheatCodes, SignerlessWallet, retryUntil } from '@aztec/aztec.js';
import { DefaultMultiCallEntrypoint } from '@aztec/aztec.js/entrypoint';
import { type AztecNode } from '@aztec/circuit-types';
import { setupCanonicalL2FeeJuice } from '@aztec/cli/misc';
import {
  type DeployL1Contracts,
  NULL_KEY,
  createEthereumChain,
  deployL1Contracts,
  getL1ContractsConfigEnvVars,
} from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { ProtocolContractAddress, protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { type PXEServiceConfig, createPXEService, getPXEServiceConfig } from '@aztec/pxe';
import { type TelemetryClient } from '@aztec/telemetry-client';
import {
  createAndStartTelemetryClient,
  getConfigEnvVars as getTelemetryClientConfig,
} from '@aztec/telemetry-client/start';

import { type HDAccount, type PrivateKeyAccount, createPublicClient, http as httpViemTransport } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

export const defaultMnemonic = 'test test test test test test test test test test test junk';

const logger = createLogger('sandbox');

const localAnvil = foundry;

/**
 * Helper function that waits for the Ethereum RPC server to respond before deploying L1 contracts.
 */
async function waitThenDeploy(config: AztecNodeConfig, deployFunction: () => Promise<DeployL1Contracts>) {
  const chain = createEthereumChain(config.l1RpcUrl, config.l1ChainId);
  // wait for ETH RPC to respond to a request.
  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: httpViemTransport(chain.rpcUrl),
  });
  const l1ChainID = await retryUntil(
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

  if (!l1ChainID) {
    throw Error(`Ethereum node unresponsive at ${chain.rpcUrl}.`);
  }

  // Deploy L1 contracts
  return await deployFunction();
}

/**
 * Function to deploy our L1 contracts to the sandbox L1
 * @param aztecNodeConfig - The Aztec Node Config
 * @param hdAccount - Account for publishing L1 contracts
 */
export async function deployContractsToL1(
  aztecNodeConfig: AztecNodeConfig,
  hdAccount: HDAccount | PrivateKeyAccount,
  contractDeployLogger = logger,
  opts: { assumeProvenThroughBlockNumber?: number; salt?: number } = {},
) {
  const chain = aztecNodeConfig.l1RpcUrl
    ? createEthereumChain(aztecNodeConfig.l1RpcUrl, aztecNodeConfig.l1ChainId)
    : { chainInfo: localAnvil };

  const l1Contracts = await waitThenDeploy(aztecNodeConfig, () =>
    deployL1Contracts(aztecNodeConfig.l1RpcUrl, hdAccount, chain.chainInfo, contractDeployLogger, {
      l2FeeJuiceAddress: ProtocolContractAddress.FeeJuice,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
      assumeProvenThrough: opts.assumeProvenThroughBlockNumber,
      salt: opts.salt,
      ...getL1ContractsConfigEnvVars(),
    }),
  );

  aztecNodeConfig.l1Contracts = l1Contracts.l1ContractAddresses;

  return aztecNodeConfig.l1Contracts;
}

/** Sandbox settings. */
export type SandboxConfig = AztecNodeConfig & {
  /** Mnemonic used to derive the L1 deployer private key.*/
  l1Mnemonic: string;
  /** Enable the contracts to track and pay for gas */
  enableGas: boolean;
};

/**
 * Create and start a new Aztec Node and PXE. Deploys L1 contracts.
 * Does not start any HTTP services nor populate any initial accounts.
 * @param config - Optional Sandbox settings.
 */
export async function createSandbox(config: Partial<SandboxConfig> = {}) {
  const aztecNodeConfig: AztecNodeConfig = { ...getConfigEnvVars(), ...config };
  const hdAccount = mnemonicToAccount(config.l1Mnemonic || defaultMnemonic);
  if (!aztecNodeConfig.publisherPrivateKey || aztecNodeConfig.publisherPrivateKey === NULL_KEY) {
    const privKey = hdAccount.getHdKey().privateKey;
    aztecNodeConfig.publisherPrivateKey = `0x${Buffer.from(privKey!).toString('hex')}`;
  }
  if (!aztecNodeConfig.validatorPrivateKey || aztecNodeConfig.validatorPrivateKey === NULL_KEY) {
    const privKey = hdAccount.getHdKey().privateKey;
    aztecNodeConfig.validatorPrivateKey = `0x${Buffer.from(privKey!).toString('hex')}`;
  }

  let watcher: AnvilTestWatcher | undefined = undefined;
  if (!aztecNodeConfig.p2pEnabled) {
    const l1ContractAddresses = await deployContractsToL1(aztecNodeConfig, hdAccount, undefined, {
      assumeProvenThroughBlockNumber: Number.MAX_SAFE_INTEGER,
    });

    const chain = aztecNodeConfig.l1RpcUrl
      ? createEthereumChain(aztecNodeConfig.l1RpcUrl, aztecNodeConfig.l1ChainId)
      : { chainInfo: localAnvil };

    const publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: httpViemTransport(aztecNodeConfig.l1RpcUrl),
    });

    watcher = new AnvilTestWatcher(
      new EthCheatCodes(aztecNodeConfig.l1RpcUrl),
      l1ContractAddresses.rollupAddress,
      publicClient,
    );
    await watcher.start();
  }

  const client = await createAndStartTelemetryClient(getTelemetryClientConfig());
  const node = await createAztecNode(aztecNodeConfig, client);
  const pxe = await createAztecPXE(node);

  if (config.enableGas) {
    await setupCanonicalL2FeeJuice(
      new SignerlessWallet(pxe, new DefaultMultiCallEntrypoint(aztecNodeConfig.l1ChainId, aztecNodeConfig.version)),
      aztecNodeConfig.l1Contracts.feeJuicePortalAddress,
      undefined,
      logger.info,
    );
  }

  const stop = async () => {
    await pxe.stop();
    await node.stop();
    await watcher?.stop();
  };

  return { node, pxe, aztecNodeConfig, stop };
}

/**
 * Create and start a new Aztec RPC HTTP Server
 * @param config - Optional Aztec node settings.
 */
export async function createAztecNode(config: Partial<AztecNodeConfig> = {}, telemetryClient?: TelemetryClient) {
  const aztecNodeConfig: AztecNodeConfig = { ...getConfigEnvVars(), ...config };
  const node = await AztecNodeService.createAndSync(aztecNodeConfig, { telemetry: telemetryClient });
  return node;
}

/**
 * Create and start a new Aztec PXE HTTP Server
 * @param config - Optional PXE settings.
 */
export async function createAztecPXE(node: AztecNode, config: Partial<PXEServiceConfig> = {}) {
  const pxeServiceConfig: PXEServiceConfig = { ...getPXEServiceConfig(), ...config };
  const pxe = await createPXEService(node, pxeServiceConfig);
  return pxe;
}
