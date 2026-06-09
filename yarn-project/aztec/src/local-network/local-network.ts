#!/usr/bin/env -S node --no-warnings
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { AztecNodeService } from '@aztec/aztec-node';
import { type AztecNodeConfig, getConfigEnvVars } from '@aztec/aztec-node/config';
import { Fr } from '@aztec/aztec.js/fields';
import { createLogger } from '@aztec/aztec.js/log';
import { type BlobClientInterface, createBlobClient } from '@aztec/blob-client/client';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { waitForPublicClient } from '@aztec/ethereum/client';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { NULL_KEY } from '@aztec/ethereum/constants';
import { deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { EthCheatCodes } from '@aztec/ethereum/test';
import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn } from '@aztec/foundation/log';
import { DateProvider, TestDateProvider } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ProvingJobBroker } from '@aztec/stdlib/interfaces/server';
import { TxStatus } from '@aztec/stdlib/tx';
import type { GenesisData } from '@aztec/stdlib/world-state';
import {
  type TelemetryClient,
  getConfigEnvVars as getTelemetryClientConfig,
  initTelemetryClient,
} from '@aztec/telemetry-client';
import { EmbeddedWallet } from '@aztec/wallets/embedded';
import { deployFundedSchnorrAccounts } from '@aztec/wallets/testing';
import { getGenesisValues } from '@aztec/world-state/testing';

import type { Hex } from 'viem';
import { mnemonicToAccount, privateKeyToAddress } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createAccountLogs } from '../cli/util.js';
import { DefaultMnemonic } from '../mnemonic.js';
import { EpochTestSettler } from '../testing/epoch_test_settler.js';
import { getTokenAllowedSetupFunctions } from '../testing/token_allowed_setup.js';
import { publishStandardAuthRegistry } from './auth_registry.js';
import { getBananaFPCAddress, setupBananaFPC } from './banana_fpc.js';
import { getSponsoredFPCAddress } from './sponsored_fpc.js';

const logger = createLogger('local-network');

// The embedded wallet defaults to waiting for PROPOSED, which returns as soon as a tx lands in a
// proposed L2 block. That is flaky for the serial sandbox setup below: a proposed block can be
// pruned before its checkpoint is published, dropping a tx we already moved on from ("Tx dropped by
// P2P node"). Wait for the checkpoint so each setup tx is durably included before the next is sent.
const setupWaitOpts = { waitForStatus: TxStatus.CHECKPOINTED };

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
    genesisArchiveRoot?: Fr;
    feeJuicePortalInitialBalance?: bigint;
  } = {},
): Promise<L1ContractAddresses> {
  await waitForPublicClient(aztecNodeConfig);

  const l1Contracts = await deployAztecL1Contracts(aztecNodeConfig.l1RpcUrls[0], privateKey, foundry.id, {
    ...getL1ContractsConfigEnvVars(), // TODO: We should not need to be loading config from env again, caller should handle this
    ...aztecNodeConfig,
    vkTreeRoot: getVKTreeRoot(),
    protocolContractsHash,
    genesisArchiveRoot: opts.genesisArchiveRoot ?? new Fr(GENESIS_ARCHIVE_ROOT),
    feeJuicePortalInitialBalance: opts.feeJuicePortalInitialBalance,
    aztecTargetCommitteeSize: 0, // no committee in local network
    slasherEnabled: false, // no slashing in local network
    realVerifier: false,
  });

  Object.assign(aztecNodeConfig, l1Contracts.l1ContractAddresses);
  aztecNodeConfig.rollupVersion = l1Contracts.rollupVersion;

  return l1Contracts.l1ContractAddresses;
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

  // The local network deploys a banana FPC with Token contracts, so include Token entries
  // in the setup allowlist so FPC-based fee payments work out of the box.
  const tokenAllowList = await getTokenAllowedSetupFunctions();

  const aztecNodeConfig: AztecNodeConfig = {
    ...getConfigEnvVars(),
    ...config,
    skipOrphanProposedBlockPruning: true,
    txPublicSetupAllowListExtend: [...tokenAllowList, ...(config.txPublicSetupAllowListExtend ?? [])],
    // The local network runs against anvil with no committee, so it uses the deterministic
    // AutomineSequencer, which owns L1 time control (warps the dateProvider and L1 timestamps to
    // slot boundaries as it builds), replacing the deleted AnvilTestWatcher.
    useAutomineSequencer: true,
  };
  const hdAccount = mnemonicToAccount(config.l1Mnemonic || DefaultMnemonic);
  if (
    aztecNodeConfig.sequencerPublisherPrivateKeys == undefined ||
    !aztecNodeConfig.sequencerPublisherPrivateKeys.length ||
    aztecNodeConfig.sequencerPublisherPrivateKeys[0].getValue() === NULL_KEY
  ) {
    const privKey = hdAccount.getHdKey().privateKey;
    aztecNodeConfig.sequencerPublisherPrivateKeys = [
      new SecretValue(`0x${Buffer.from(privKey!).toString('hex')}` as const),
    ];
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
  const prefundAddresses = (aztecNodeConfig.prefundAddresses ?? []).map(a => AztecAddress.fromString(a));
  const fundedAddresses = [
    ...initialAccounts.map(a => a.address),
    ...(initialAccounts.length ? [bananaFPC, sponsoredFPC] : []),
    ...prefundAddresses,
  ];
  const { genesisArchiveRoot, genesis, fundingNeeded } = await getGenesisValues(fundedAddresses);

  const dateProvider = new TestDateProvider();

  let cheatcodes: EthCheatCodes | undefined;
  let rollupAddress: EthAddress | undefined;
  if (!aztecNodeConfig.p2pEnabled) {
    ({ rollupAddress } = await deployContractsToL1(
      aztecNodeConfig,
      aztecNodeConfig.validatorPrivateKeys.getValue()[0],
      {
        genesisArchiveRoot,
        feeJuicePortalInitialBalance: fundingNeeded,
      },
    ));

    cheatcodes = new EthCheatCodes([l1RpcUrl], dateProvider);
  }

  const telemetry = await initTelemetryClient(getTelemetryClientConfig());
  // Create a local blob client client inside the local network, no http connectivity
  const blobClient = createBlobClient();
  const node = await createAztecNode(aztecNodeConfig, { telemetry, blobClient, dateProvider }, { genesis });

  let epochTestSettler: EpochTestSettler | undefined;
  if (!aztecNodeConfig.p2pEnabled) {
    epochTestSettler = new EpochTestSettler(
      cheatcodes!,
      rollupAddress!,
      node.getBlockSource(),
      logger.createChild('epoch-settler'),
      { pollingIntervalMs: 200 },
    );
    await epochTestSettler.start();
  }

  if (initialAccounts.length) {
    const wallet = await EmbeddedWallet.create(node, {
      pxeConfig: { proverEnabled: aztecNodeConfig.realProofs },
      ephemeral: true,
    });

    userLog('Setting up funded test accounts...');
    const accountManagers = await deployFundedSchnorrAccounts(wallet, initialAccounts, setupWaitOpts);
    const accLogs = await createAccountLogs(accountManagers, wallet);
    userLog(accLogs.join(''));

    userLog('Publishing standard AuthRegistry contract...');
    await publishStandardAuthRegistry(wallet, initialAccounts[0].address, setupWaitOpts);

    await setupBananaFPC(initialAccounts, wallet, userLog, setupWaitOpts);

    userLog(`SponsoredFPC: ${await getSponsoredFPCAddress()}`);

    // We no longer need the wallet once we've setup the accounts so we stop the underlying PXE job queue
    await wallet.stop();
  }

  const stop = async () => {
    await node.stop();
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
  deps: {
    telemetry?: TelemetryClient;
    blobClient?: BlobClientInterface;
    dateProvider?: DateProvider;
    proverBroker?: ProvingJobBroker;
  } = {},
  options: { genesis?: GenesisData } = {},
) {
  // TODO(#12272): will clean this up. This is criminal.
  // Not sure why this was ever done. Will be fixed in A-989, A-991, A-990.
  const aztecNodeConfig: AztecNodeConfig = {
    ...getConfigEnvVars(),
    ...config,
  };
  const node = await AztecNodeService.createAndSync(
    aztecNodeConfig,
    { ...deps, proverNodeDeps: { broker: deps.proverBroker } },
    options,
  );
  return node;
}
