#!/usr/bin/env -S node --no-warnings
import { getSchnorrWallet } from '@aztec/accounts/schnorr';
import { deployFundedSchnorrAccounts, getInitialTestAccounts } from '@aztec/accounts/testing';
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { AnvilTestWatcher, EthCheatCodes, SignerlessWallet, type Wallet } from '@aztec/aztec.js';
import { type BlobSinkClientInterface, createBlobSinkClient } from '@aztec/blob-sink/client';
import { type AztecNode, type PXE } from '@aztec/circuit-types';
import { type ContractInstanceWithAddress, getContractInstanceFromDeployParams } from '@aztec/circuits.js';
import { type PublicDataTreeLeaf } from '@aztec/circuits.js/trees';
import { setupCanonicalL2FeeJuice } from '@aztec/cli/setup-contracts';
import { GENESIS_ARCHIVE_ROOT, GENESIS_BLOCK_HASH } from '@aztec/constants';
import {
  NULL_KEY,
  createEthereumChain,
  deployL1Contracts,
  getL1ContractsConfigEnvVars,
  waitForPublicClient,
} from '@aztec/ethereum';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { type LogFn, createLogger } from '@aztec/foundation/log';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { ProtocolContractAddress, protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { type PXEServiceConfig, createPXEService, getPXEServiceConfig } from '@aztec/pxe';
import {
  type TelemetryClient,
  getConfigEnvVars as getTelemetryClientConfig,
  initTelemetryClient,
} from '@aztec/telemetry-client';
import { getGenesisValues } from '@aztec/world-state/testing';

import { type HDAccount, type PrivateKeyAccount, createPublicClient, http as httpViemTransport } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createAccountLogs } from './cli/util.js';
import { DefaultMnemonic } from './mnemonic.js';

const logger = createLogger('sandbox');

const localAnvil = foundry;

/**
 * Function to deploy our L1 contracts to the sandbox L1
 * @param aztecNodeConfig - The Aztec Node Config
 * @param hdAccount - Account for publishing L1 contracts
 */
export async function deployContractsToL1(
  aztecNodeConfig: AztecNodeConfig,
  hdAccount: HDAccount | PrivateKeyAccount,
  contractDeployLogger = logger,
  opts: { assumeProvenThroughBlockNumber?: number; salt?: number; genesisArchiveRoot?: Fr; genesisBlockHash?: Fr } = {},
) {
  const chain = aztecNodeConfig.l1RpcUrl
    ? createEthereumChain(aztecNodeConfig.l1RpcUrl, aztecNodeConfig.l1ChainId)
    : { chainInfo: localAnvil };

  await waitForPublicClient(aztecNodeConfig);

  const l1Contracts = await deployL1Contracts(
    aztecNodeConfig.l1RpcUrl,
    hdAccount,
    chain.chainInfo,
    contractDeployLogger,
    {
      ...getL1ContractsConfigEnvVars(), // TODO: We should not need to be loading config from env again, caller should handle this
      ...aztecNodeConfig,
      l2FeeJuiceAddress: ProtocolContractAddress.FeeJuice,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
      genesisArchiveRoot: opts.genesisArchiveRoot ?? new Fr(GENESIS_ARCHIVE_ROOT),
      genesisBlockHash: opts.genesisBlockHash ?? new Fr(GENESIS_BLOCK_HASH),
      assumeProvenThrough: opts.assumeProvenThroughBlockNumber,
      salt: opts.salt,
    },
  );

  aztecNodeConfig.l1Contracts = l1Contracts.l1ContractAddresses;

  return aztecNodeConfig.l1Contracts;
}

async function getBananaCoinInstance(admin: AztecAddress): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromDeployParams(TokenContract.artifact, {
    constructorArgs: [admin, 'BC', 'BC', 18n],
    salt: new Fr(0),
  });
}

async function getBananaFPCInstance(
  admin: AztecAddress,
  bananaCoin: AztecAddress,
): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromDeployParams(FPCContract.artifact, {
    constructorArgs: [bananaCoin, admin],
    salt: new Fr(0),
  });
}

async function setupFPC(
  admin: AztecAddress,
  deployer: Wallet,
  bananaCoinInstance: ContractInstanceWithAddress,
  fpcInstance: ContractInstanceWithAddress,
  log: LogFn,
) {
  const [bananaCoin, fpc] = await Promise.all([
    TokenContract.deploy(deployer, admin, 'BC', 'BC', 18n)
      .send({ contractAddressSalt: bananaCoinInstance.salt, universalDeploy: true })
      .deployed(),
    FPCContract.deploy(deployer, bananaCoinInstance.address, admin)
      .send({ contractAddressSalt: fpcInstance.salt, universalDeploy: true })
      .deployed(),
  ]);

  log(`BananaCoin: ${bananaCoin.address}`);
  log(`FPC: ${fpc.address}`);
}

export async function getDeployedBananaCoinAddress(pxe: PXE) {
  const [initialAccount] = await getInitialTestAccounts();
  const bananaCoin = await getBananaCoinInstance(initialAccount.address);
  const contracts = await pxe.getContracts();
  if (!contracts.find(c => c.equals(bananaCoin.address))) {
    throw new Error('BananaCoin not deployed.');
  }
  return bananaCoin.address;
}

export async function getDeployedBananaFPCAddress(pxe: PXE) {
  const [initialAccount] = await getInitialTestAccounts();
  const bananaCoin = await getBananaCoinInstance(initialAccount.address);
  const fpc = await getBananaFPCInstance(initialAccount.address, bananaCoin.address);
  const contracts = await pxe.getContracts();
  if (!contracts.find(c => c.equals(fpc.address))) {
    throw new Error('BananaFPC not deployed.');
  }
  return fpc.address;
}

/** Sandbox settings. */
export type SandboxConfig = AztecNodeConfig & {
  /** Mnemonic used to derive the L1 deployer private key.*/
  l1Mnemonic: string;
  /** Salt used to deploy L1 contracts.*/
  l1Salt: string;
  /** Whether to expose PXE service on sandbox start.*/
  noPXE: boolean;
  /** Whether to deploy test accounts on sandbox start.*/
  testAccounts: boolean;
};

/**
 * Create and start a new Aztec Node and PXE. Deploys L1 contracts.
 * Does not start any HTTP services nor populate any initial accounts.
 * @param config - Optional Sandbox settings.
 */
export async function createSandbox(config: Partial<SandboxConfig> = {}, userLog: LogFn) {
  const aztecNodeConfig: AztecNodeConfig = { ...getConfigEnvVars(), ...config };
  const hdAccount = mnemonicToAccount(config.l1Mnemonic || DefaultMnemonic);
  if (!aztecNodeConfig.publisherPrivateKey || aztecNodeConfig.publisherPrivateKey === NULL_KEY) {
    const privKey = hdAccount.getHdKey().privateKey;
    aztecNodeConfig.publisherPrivateKey = `0x${Buffer.from(privKey!).toString('hex')}`;
  }
  if (!aztecNodeConfig.validatorPrivateKey || aztecNodeConfig.validatorPrivateKey === NULL_KEY) {
    const privKey = hdAccount.getHdKey().privateKey;
    aztecNodeConfig.validatorPrivateKey = `0x${Buffer.from(privKey!).toString('hex')}`;
  }

  const initialAccounts = await (async () => {
    if (config.testAccounts) {
      if (aztecNodeConfig.p2pEnabled) {
        userLog(`Not setting up test accounts as we are connecting to a network`);
      } else if (config.noPXE) {
        userLog(`Not setting up test accounts as we are not exposing a PXE`);
      } else {
        return await getInitialTestAccounts();
      }
    }
    return [];
  })();

  const bananaAdmin = initialAccounts[0]?.address ?? AztecAddress.ZERO;
  const bananaCoin = await getBananaCoinInstance(bananaAdmin);
  const fpc = await getBananaFPCInstance(bananaAdmin, bananaCoin.address);
  const fundedAddresses = initialAccounts.length ? [...initialAccounts.map(a => a.address), fpc.address] : [];
  const { genesisArchiveRoot, genesisBlockHash, prefilledPublicData } = await getGenesisValues(fundedAddresses);

  let watcher: AnvilTestWatcher | undefined = undefined;
  if (!aztecNodeConfig.p2pEnabled) {
    const l1ContractAddresses = await deployContractsToL1(aztecNodeConfig, hdAccount, undefined, {
      assumeProvenThroughBlockNumber: Number.MAX_SAFE_INTEGER,
      genesisArchiveRoot,
      genesisBlockHash,
      salt: config.l1Salt ? parseInt(config.l1Salt) : undefined,
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
    watcher.setIsSandbox(true);
    await watcher.start();
  }

  const telemetry = initTelemetryClient(getTelemetryClientConfig());
  // Create a local blob sink client inside the sandbox, no http connectivity
  const blobSinkClient = createBlobSinkClient();
  const node = await createAztecNode(aztecNodeConfig, { telemetry, blobSinkClient }, { prefilledPublicData });
  const pxe = await createAztecPXE(node);

  await setupCanonicalL2FeeJuice(
    new SignerlessWallet(pxe),
    aztecNodeConfig.l1Contracts.feeJuicePortalAddress,
    undefined,
    logger.info,
  );

  if (initialAccounts.length) {
    userLog('Setting up funded test accounts...');
    const accounts = await deployFundedSchnorrAccounts(pxe, initialAccounts);
    const accountsWithSecrets = accounts.map((account, i) => ({
      account,
      secretKey: initialAccounts[i].secret,
    }));
    const accLogs = await createAccountLogs(accountsWithSecrets, pxe);
    userLog(accLogs.join(''));

    const deployer = await getSchnorrWallet(pxe, initialAccounts[0].address, initialAccounts[0].signingKey);
    await setupFPC(bananaAdmin, deployer, bananaCoin, fpc, userLog);
  }

  const stop = async () => {
    await node.stop();
    await watcher?.stop();
  };

  return { node, pxe, stop };
}

/**
 * Create and start a new Aztec RPC HTTP Server
 * @param config - Optional Aztec node settings.
 */
export async function createAztecNode(
  config: Partial<AztecNodeConfig> = {},
  deps: { telemetry?: TelemetryClient; blobSinkClient?: BlobSinkClientInterface } = {},
  options: { prefilledPublicData?: PublicDataTreeLeaf[] } = {},
) {
  const aztecNodeConfig: AztecNodeConfig = { ...getConfigEnvVars(), ...config };
  const node = await AztecNodeService.createAndSync(aztecNodeConfig, deps, options);
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
