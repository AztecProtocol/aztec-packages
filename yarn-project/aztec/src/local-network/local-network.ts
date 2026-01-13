#!/usr/bin/env -S node --no-warnings
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { AztecNodeService } from '@aztec/aztec-node';
import { type AztecNodeConfig, getConfigEnvVars } from '@aztec/aztec-node/config';
import { Fr } from '@aztec/aztec.js/fields';
import { createLogger } from '@aztec/aztec.js/log';
import { type BlobClientInterface, createBlobClient } from '@aztec/blob-client/client';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { waitForPublicClient } from '@aztec/ethereum/client';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { NULL_KEY } from '@aztec/ethereum/constants';
import { deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { EthCheatCodes } from '@aztec/ethereum/test';
import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn } from '@aztec/foundation/log';
import { DateProvider, TestDateProvider } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import {
  type TelemetryClient,
  getConfigEnvVars as getTelemetryClientConfig,
  initTelemetryClient,
} from '@aztec/telemetry-client';
import { TestWallet, deployFundedSchnorrAccounts } from '@aztec/test-wallet/server';
import { getGenesisValues } from '@aztec/world-state/testing';

import { type Hex, createPublicClient, fallback, http as httpViemTransport } from 'viem';
import { mnemonicToAccount, privateKeyToAddress } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createAccountLogs } from '../cli/util.js';
import { DefaultMnemonic } from '../mnemonic.js';
import { AnvilTestWatcher } from '../testing/anvil_test_watcher.js';
import { EpochTestSettler } from '../testing/epoch_test_settler.js';
import { getBananaFPCAddress, setupBananaFPC } from './banana_fpc.js';
import { getSponsoredFPCAddress } from './sponsored_fpc.js';

const logger = createLogger('local-network');

const localAnvil = foundry;

/**
 * Function to deploy our L1 contracts to the local network L1
 * @param aztecNodeConfig - The Aztec Node Config
 * @param hdAccount - Account for publishing L1 contracts
 */
export async function deployContractsToL1(
  aztecNodeConfig: AztecNodeConfig,
  privateKey: Hex,
  opts: {
    assumeProvenThroughBlockNumber?: number;
    genesisArchiveRoot?: Fr;
    feeJuicePortalInitialBalance?: bigint;
  } = {},
) {
  await waitForPublicClient(aztecNodeConfig);

  const l1Contracts = await deployAztecL1Contracts(aztecNodeConfig.l1RpcUrls[0], privateKey, foundry.id, {
    ...getL1ContractsConfigEnvVars(), // TODO: We should not need to be loading config from env again, caller should handle this
    ...aztecNodeConfig,
    vkTreeRoot: getVKTreeRoot(),
    protocolContractsHash,
    genesisArchiveRoot: opts.genesisArchiveRoot ?? new Fr(GENESIS_ARCHIVE_ROOT),
    feeJuicePortalInitialBalance: opts.feeJuicePortalInitialBalance,
    aztecTargetCommitteeSize: 0, // no committee in local network
    slasherFlavor: 'none', // no slashing in local network
    realVerifier: false,
  });

  aztecNodeConfig.l1Contracts = l1Contracts.l1ContractAddresses;
  aztecNodeConfig.rollupVersion = l1Contracts.rollupVersion;

  return aztecNodeConfig.l1Contracts;
}

/** Local network settings. */
export type LocalNetworkConfig = AztecNodeConfig & {
  /** Mnemonic used to derive the L1 deployer private key.*/
  l1Mnemonic: string;
  /** Whether to deploy test accounts on local network start.*/
  testAccounts: boolean;
};

/**
 * Create and start a new Aztec Node and PXE. Deploys L1 contracts.
 * Does not start any HTTP services nor populate any initial accounts.
 * @param config - Optional local network settings.
 */
export async function createLocalNetwork(config: Partial<LocalNetworkConfig> = {}, userLog: LogFn) {
  // local network is meant for test envs. We should only need one l1RpcUrl
  const l1RpcUrl = config.l1RpcUrls?.[0];
  if (!l1RpcUrl) {
    throw new Error('An L1 RPC URL is required');
  }
  if ((config.l1RpcUrls?.length || 0) > 1) {
    logger.warn(`Multiple L1 RPC URLs provided. Local networks will only use the first one: ${l1RpcUrl}`);
  }

  const aztecNodeConfig: AztecNodeConfig = {
    ...getConfigEnvVars(),
    ...config,
  };
  const hdAccount = mnemonicToAccount(config.l1Mnemonic || DefaultMnemonic);
  if (
    aztecNodeConfig.publisherPrivateKeys == undefined ||
    !aztecNodeConfig.publisherPrivateKeys.length ||
    aztecNodeConfig.publisherPrivateKeys[0].getValue() === NULL_KEY
  ) {
    const privKey = hdAccount.getHdKey().privateKey;
    aztecNodeConfig.publisherPrivateKeys = [new SecretValue(`0x${Buffer.from(privKey!).toString('hex')}` as const)];
  }
  if (!aztecNodeConfig.validatorPrivateKeys?.getValue().length) {
    const privKey = hdAccount.getHdKey().privateKey;
    aztecNodeConfig.validatorPrivateKeys = new SecretValue([`0x${Buffer.from(privKey!).toString('hex')}`]);
  }
  aztecNodeConfig.coinbase = EthAddress.fromString(
    privateKeyToAddress(aztecNodeConfig.validatorPrivateKeys.getValue()[0]),
  );

  const initialAccounts = await (async () => {
    if (config.testAccounts === true || config.testAccounts === undefined) {
      if (aztecNodeConfig.p2pEnabled) {
        userLog(`Not setting up test accounts as we are connecting to a network`);
      } else {
        userLog(`Setting up test accounts`);
        return await getInitialTestAccountsData();
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

  const dateProvider = new TestDateProvider();

  let cheatcodes: EthCheatCodes | undefined;
  let rollupAddress: EthAddress | undefined;
  let watcher: AnvilTestWatcher | undefined;
  if (!aztecNodeConfig.p2pEnabled) {
    ({ rollupAddress } = await deployContractsToL1(
      aztecNodeConfig,
      aztecNodeConfig.validatorPrivateKeys.getValue()[0],
      {
        assumeProvenThroughBlockNumber: Number.MAX_SAFE_INTEGER,
        genesisArchiveRoot,
        feeJuicePortalInitialBalance: fundingNeeded,
      },
    ));

    const chain =
      aztecNodeConfig.l1RpcUrls.length > 0
        ? createEthereumChain([l1RpcUrl], aztecNodeConfig.l1ChainId)
        : { chainInfo: localAnvil };

    const publicClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback([httpViemTransport(l1RpcUrl)]) as any,
    });

    cheatcodes = new EthCheatCodes([l1RpcUrl], dateProvider);

    watcher = new AnvilTestWatcher(cheatcodes, rollupAddress, publicClient, dateProvider);
    watcher.setisLocalNetwork(true);
    watcher.setIsMarkingAsProven(false); // Do not mark as proven in the watcher. It's marked in the epochTestSettler after the out hash is set.

    await watcher.start();
  }

  const telemetry = await initTelemetryClient(getTelemetryClientConfig());
  // Create a local blob client client inside the local network, no http connectivity
  const blobClient = createBlobClient();
  const node = await createAztecNode(aztecNodeConfig, { telemetry, blobClient, dateProvider }, { prefilledPublicData });

  let epochTestSettler: EpochTestSettler | undefined;
  if (!aztecNodeConfig.p2pEnabled) {
    epochTestSettler = new EpochTestSettler(cheatcodes!, rollupAddress!, node.getBlockSource(), {
      pollingIntervalMs: 200,
    });
    await epochTestSettler.start();
  }

  if (initialAccounts.length) {
    const PXEConfig = { proverEnabled: aztecNodeConfig.realProofs };
    const wallet = await TestWallet.create(node, PXEConfig);

    userLog('Setting up funded test accounts...');
    const accountManagers = await deployFundedSchnorrAccounts(wallet, node, initialAccounts);
    const accountsWithSecrets = accountManagers.map((manager, i) => ({
      account: manager,
      secretKey: initialAccounts[i].secret,
    }));
    const accLogs = await createAccountLogs(accountsWithSecrets, wallet);
    userLog(accLogs.join(''));

    await setupBananaFPC(initialAccounts, wallet, userLog);

    userLog(`SponsoredFPC: ${await getSponsoredFPCAddress()}`);

    // We no longer need the wallet once we've setup the accounts so we stop the underlying PXE job queue
    await wallet.stop();
  }

  const stop = async () => {
    await node.stop();
    await watcher?.stop();
    await epochTestSettler?.stop();
  };

  return { node, stop };
}

/**
 * Create and start a new Aztec RPC HTTP Server
 * @param config - Optional Aztec node settings.
 */
export async function createAztecNode(
  config: Partial<AztecNodeConfig> = {},
  deps: { telemetry?: TelemetryClient; blobClient?: BlobClientInterface; dateProvider?: DateProvider } = {},
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
