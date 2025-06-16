#!/usr/bin/env -S node --no-warnings
import { getSchnorrWallet } from '@aztec/accounts/schnorr';
import { deployFundedSchnorrAccounts, getInitialTestAccounts } from '@aztec/accounts/testing';
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { AnvilTestWatcher, EthCheatCodes } from '@aztec/aztec.js/testing';
import { type BlobSinkClientInterface, createBlobSinkClient } from '@aztec/blob-sink/client';
import { setupSponsoredFPC } from '@aztec/cli/cli-utils';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import {
  NULL_KEY,
  createEthereumChain,
  deployL1Contracts,
  getL1ContractsConfigEnvVars,
  waitForPublicClient,
} from '@aztec/ethereum';
import { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/fields';
import { type LogFn, createLogger } from '@aztec/foundation/log';
import { DateProvider, TestDateProvider } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { type PXEServiceConfig, createPXEService, getPXEServiceConfig } from '@aztec/pxe/server';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import {
  type TelemetryClient,
  getConfigEnvVars as getTelemetryClientConfig,
  initTelemetryClient,
} from '@aztec/telemetry-client';
import { getGenesisValues } from '@aztec/world-state/testing';

import { type HDAccount, type PrivateKeyAccount, createPublicClient, fallback, http as httpViemTransport } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createAccountLogs } from '../cli/util.js';
import { DefaultMnemonic } from '../mnemonic.js';
import { getBananaFPCAddress, setupBananaFPC } from './banana_fpc.js';
import { getSponsoredFPCAddress } from './sponsored_fpc.js';

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
  opts: {
    assumeProvenThroughBlockNumber?: number;
    salt?: number;
    genesisArchiveRoot?: Fr;
    feeJuicePortalInitialBalance?: bigint;
  } = {},
) {
  const chain =
    aztecNodeConfig.l1RpcUrls.length > 0
      ? createEthereumChain(aztecNodeConfig.l1RpcUrls, aztecNodeConfig.l1ChainId)
      : { chainInfo: localAnvil };

  await waitForPublicClient(aztecNodeConfig);

  const l1Contracts = await deployL1Contracts(
    aztecNodeConfig.l1RpcUrls,
    hdAccount,
    chain.chainInfo,
    contractDeployLogger,
    {
      ...getL1ContractsConfigEnvVars(), // TODO: We should not need to be loading config from env again, caller should handle this
      ...aztecNodeConfig,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
      genesisArchiveRoot: opts.genesisArchiveRoot ?? new Fr(GENESIS_ARCHIVE_ROOT),
      salt: opts.salt,
      feeJuicePortalInitialBalance: opts.feeJuicePortalInitialBalance,
      aztecTargetCommitteeSize: 0, // no committee in sandbox
      realVerifier: false,
    },
  );

  aztecNodeConfig.l1Contracts = l1Contracts.l1ContractAddresses;
  aztecNodeConfig.rollupVersion = l1Contracts.rollupVersion;

  return aztecNodeConfig.l1Contracts;
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
  // sandbox is meant for test envs. We should only need one l1RpcUrl
  const l1RpcUrl = config.l1RpcUrls?.[0];
  if (!l1RpcUrl) {
    throw new Error('An L1 RPC URL is required');
  }
  if ((config.l1RpcUrls?.length || 0) > 1) {
    logger.warn(`Multiple L1 RPC URLs provided. Sandbox will only use the first one: ${l1RpcUrl}`);
  }
  const aztecNodeConfig: AztecNodeConfig = { ...getConfigEnvVars(), ...config };
  const hdAccount = mnemonicToAccount(config.l1Mnemonic || DefaultMnemonic);
  if (!aztecNodeConfig.publisherPrivateKey.getValue() || aztecNodeConfig.publisherPrivateKey.getValue() === NULL_KEY) {
    const privKey = hdAccount.getHdKey().privateKey;
    aztecNodeConfig.publisherPrivateKey = new SecretValue(`0x${Buffer.from(privKey!).toString('hex')}` as const);
  }
  if (!aztecNodeConfig.validatorPrivateKeys.getValue().length) {
    const privKey = hdAccount.getHdKey().privateKey;
    aztecNodeConfig.validatorPrivateKeys = new SecretValue([`0x${Buffer.from(privKey!).toString('hex')}`]);
  }

  const initialAccounts = await (async () => {
    if (config.testAccounts === true || config.testAccounts === undefined) {
      if (aztecNodeConfig.p2pEnabled) {
        userLog(`Not setting up test accounts as we are connecting to a network`);
      } else {
        userLog(`Setting up test accounts`);
        return await getInitialTestAccounts();
      }
    }
    return [];
  })();

  const bananaFPC = await getBananaFPCAddress(initialAccounts);
  const sponsoredFPC = await getSponsoredFPCAddress();
  const fundedAddresses = initialAccounts.length
    ? [...initialAccounts.map(a => a.address), bananaFPC, sponsoredFPC]
    : [];
  const { genesisArchiveRoot, prefilledPublicData, fundingNeeded } = await getGenesisValues(fundedAddresses);

  let watcher: AnvilTestWatcher | undefined = undefined;
  const dateProvider = new TestDateProvider();
  if (!aztecNodeConfig.p2pEnabled) {
    const l1ContractAddresses = await deployContractsToL1(aztecNodeConfig, hdAccount, undefined, {
      assumeProvenThroughBlockNumber: Number.MAX_SAFE_INTEGER,
      genesisArchiveRoot,
      salt: config.l1Salt ? parseInt(config.l1Salt) : undefined,
      feeJuicePortalInitialBalance: fundingNeeded,
    });

    const chain =
      aztecNodeConfig.l1RpcUrls.length > 0
        ? createEthereumChain([l1RpcUrl], aztecNodeConfig.l1ChainId)
        : { chainInfo: localAnvil };

    const publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback([httpViemTransport(l1RpcUrl)]) as any,
    });

    watcher = new AnvilTestWatcher(
      new EthCheatCodes([l1RpcUrl]),
      l1ContractAddresses.rollupAddress,
      publicClient,
      dateProvider,
    );
    watcher.setIsSandbox(true);
    await watcher.start();
  }

  const telemetry = initTelemetryClient(getTelemetryClientConfig());
  // Create a local blob sink client inside the sandbox, no http connectivity
  const blobSinkClient = createBlobSinkClient();
  const node = await createAztecNode(
    aztecNodeConfig,
    { telemetry, blobSinkClient, dateProvider },
    { prefilledPublicData },
  );
  const pxeServiceConfig = { proverEnabled: aztecNodeConfig.realProofs };
  const pxe = await createAztecPXE(node, pxeServiceConfig);

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
    await setupBananaFPC(initialAccounts, deployer, userLog);
    await setupSponsoredFPC(pxe, userLog);
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
  deps: { telemetry?: TelemetryClient; blobSinkClient?: BlobSinkClientInterface; dateProvider?: DateProvider } = {},
  options: { prefilledPublicData?: PublicDataTreeLeaf[] } = {},
) {
  // TODO(#12272): will clean this up. This is criminal.
  const { l1Contracts, ...rest } = getConfigEnvVars();
  const aztecNodeConfig: AztecNodeConfig = {
    ...rest,
    ...config,
    l1Contracts: { ...l1Contracts, ...config.l1Contracts },
  };
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
