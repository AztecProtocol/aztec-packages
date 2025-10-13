import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';
import { type InitialAccountData, generateSchnorrAccounts, getInitialTestAccountsData } from '@aztec/accounts/testing';
import { type Archiver, createArchiver } from '@aztec/archiver';
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import {
  AztecAddress,
  type AztecNode,
  BatchCall,
  type ContractMethod,
  type Logger,
  type Wallet,
  createAztecNodeClient,
  createLogger,
  sleep,
  waitForNode,
} from '@aztec/aztec.js';
import { publishContractClass, publishInstance } from '@aztec/aztec.js/deployment';
import { AnvilTestWatcher, CheatCodes } from '@aztec/aztec/testing';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import { type BlobSinkServer, createBlobSinkServer } from '@aztec/blob-sink/server';
import { GENESIS_ARCHIVE_ROOT, SPONSORED_FPC_SALT } from '@aztec/constants';
import {
  type DeployL1ContractsArgs,
  type DeployL1ContractsReturnType,
  FeeAssetArtifact,
  NULL_KEY,
  type Operator,
  RollupContract,
  createExtendedL1Client,
  deployL1Contracts,
  deployMulticall3,
  getL1ContractsConfigEnvVars,
  isAnvilTestChain,
} from '@aztec/ethereum';
import {
  DelayedTxUtils,
  EthCheatCodes,
  EthCheatCodesWithState,
  createDelayedL1TxUtilsFromViemWallet,
  startAnvil,
} from '@aztec/ethereum/test';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { tryRmDir } from '@aztec/foundation/fs';
import { withLogNameSuffix } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider, TestDateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import type { P2PClientDeps } from '@aztec/p2p';
import { MockGossipSubNetwork, getMockPubSubP2PServiceFactory } from '@aztec/p2p/test-helpers';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { type ProverNode, type ProverNodeConfig, type ProverNodeDeps, createProverNode } from '@aztec/prover-node';
import { type PXEConfig, getPXEConfig } from '@aztec/pxe/server';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import {
  type ContractInstanceWithAddress,
  getContractClassFromArtifact,
  getContractInstanceFromInstantiationParams,
} from '@aztec/stdlib/contract';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import type { P2PClientType } from '@aztec/stdlib/p2p';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import {
  type TelemetryClient,
  type TelemetryClientConfig,
  getConfigEnvVars as getTelemetryConfig,
  initTelemetryClient,
} from '@aztec/telemetry-client';
import { BenchmarkTelemetryClient } from '@aztec/telemetry-client/bench';
import { TestWallet, deployFundedSchnorrAccounts } from '@aztec/test-wallet/server';
import { getGenesisValues } from '@aztec/world-state/testing';

import type { Anvil } from '@viem/anvil';
import fs from 'fs/promises';
import getPort from 'get-port';
import { tmpdir } from 'os';
import * as path from 'path';
import { type Chain, type HDAccount, type Hex, type PrivateKeyAccount, getContract } from 'viem';
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { MNEMONIC, TEST_PEER_CHECK_INTERVAL_MS } from './fixtures.js';
import { getACVMConfig } from './get_acvm_config.js';
import { getBBConfig } from './get_bb_config.js';
import { isMetricsLoggingRequested, setupMetricsLogger } from './logging.js';

export { deployAndInitializeTokenAndBridgeContracts } from '../shared/cross_chain_test_harness.js';
export { startAnvil };

const { AZTEC_NODE_URL = '' } = process.env;
const getAztecUrl = () => AZTEC_NODE_URL;

let telemetry: TelemetryClient | undefined = undefined;
function getTelemetryClient(partialConfig: Partial<TelemetryClientConfig> & { benchmark?: boolean } = {}) {
  if (!telemetry) {
    const config = { ...getTelemetryConfig(), ...partialConfig };
    telemetry = config.benchmark ? new BenchmarkTelemetryClient() : initTelemetryClient(config);
  }
  return telemetry;
}
if (typeof afterAll === 'function') {
  afterAll(async () => {
    await telemetry?.stop();
  });
}

export const getPrivateKeyFromIndex = (index: number): Buffer | null => {
  const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: index });
  const privKeyRaw = hdAccount.getHdKey().privateKey;
  return privKeyRaw === null ? null : Buffer.from(privKeyRaw);
};

export const setupL1Contracts = async (
  l1RpcUrls: string[],
  account: HDAccount | PrivateKeyAccount,
  logger: Logger,
  args: Partial<DeployL1ContractsArgs> = {},
  chain: Chain = foundry,
) => {
  const l1Data = await deployL1Contracts(l1RpcUrls, account, chain, logger, {
    vkTreeRoot: getVKTreeRoot(),
    protocolContractsHash,
    genesisArchiveRoot: args.genesisArchiveRoot ?? new Fr(GENESIS_ARCHIVE_ROOT),
    salt: args.salt,
    initialValidators: args.initialValidators,
    ...getL1ContractsConfigEnvVars(),
    realVerifier: false,
    ...args,
  });

  return l1Data;
};

/**
 * Sets up Private eXecution Environment (PXE) and returns the corresponding test wallet.
 * @param aztecNode - An instance of Aztec Node.
 * @param opts - Partial configuration for the PXE.
 * @param logger - The logger to be used.
 * @param useLogSuffix - Whether to add a randomly generated suffix to the PXE debug logs.
 * @returns A test wallet, logger and teardown function.
 */
export async function setupPXEAndGetWallet(
  aztecNode: AztecNode,
  opts: Partial<PXEConfig> = {},
  logger = getLogger(),
  useLogSuffix = false,
): Promise<{
  /**
   * The wallet instance.
   */
  wallet: TestWallet;
  /**
   * Logger instance named as the current test.
   */
  logger: Logger;
  /**
   * Teardown function
   */
  teardown: () => Promise<void>;
}> {
  const PXEConfig = { ...getPXEConfig(), ...opts };
  // For tests we only want proving enabled if specifically requested
  PXEConfig.proverEnabled = !!opts.proverEnabled;

  // If no data directory provided, create a temp directory and clean up afterwards
  const configuredDataDirectory = PXEConfig.dataDirectory;
  if (!configuredDataDirectory) {
    PXEConfig.dataDirectory = path.join(tmpdir(), randomBytes(8).toString('hex'));
  }

  const teardown = configuredDataDirectory ? () => Promise.resolve() : () => tryRmDir(PXEConfig.dataDirectory!);

  const wallet = await TestWallet.create(aztecNode, PXEConfig, {
    useLogSuffix,
  });

  return {
    wallet,
    logger,
    teardown,
  };
}

/**
 * Function to setup the test against a remote deployment. It is assumed that L1 contract are already deployed
 * @param account - The account for use in create viem wallets.
 * @param config - The aztec Node Configuration
 * @param logger - The logger to be used
 * @param numberOfAccounts - The number of new accounts to be created once the PXE is initiated.
 * (will create extra accounts if the environment doesn't already have enough accounts)
 * @returns Private eXecution Environment (PXE) client, viem wallets, contract addresses etc.
 */
async function setupWithRemoteEnvironment(
  account: HDAccount | PrivateKeyAccount,
  config: AztecNodeConfig,
  logger: Logger,
  numberOfAccounts: number,
): Promise<EndToEndContext> {
  // we are setting up against a remote environment, l1 contracts are already deployed
  const aztecNodeUrl = getAztecUrl();
  logger.verbose(`Creating Aztec Node client to remote host ${aztecNodeUrl}`);
  const aztecNode = createAztecNodeClient(aztecNodeUrl);
  await waitForNode(aztecNode, logger);
  logger.verbose('JSON RPC client connected to Aztec Node');
  logger.verbose(`Retrieving contract addresses from ${aztecNodeUrl}`);
  const { l1ContractAddresses, rollupVersion } = await aztecNode.getNodeInfo();

  const l1Client = createExtendedL1Client(config.l1RpcUrls, account, foundry);

  const deployL1ContractsValues: DeployL1ContractsReturnType = {
    l1ContractAddresses,
    l1Client,
    rollupVersion,
  };
  const ethCheatCodes = new EthCheatCodes(config.l1RpcUrls, new DateProvider());
  const wallet = await TestWallet.create(aztecNode);
  const cheatCodes = await CheatCodes.create(config.l1RpcUrls, aztecNode, new DateProvider());
  const teardown = () => Promise.resolve();

  logger.verbose('Populating wallet from already registered accounts...');
  const initialFundedAccounts = await getInitialTestAccountsData();

  if (initialFundedAccounts.length < numberOfAccounts) {
    throw new Error(`Required ${numberOfAccounts} accounts. Found ${initialFundedAccounts.length}.`);
    // Deploy new accounts if there's a test that requires more funded accounts in the remote environment.
  }

  const testAccounts = await Promise.all(
    initialFundedAccounts.slice(0, numberOfAccounts).map(async account => {
      const accountManager = await wallet.createSchnorrAccount(account.secret, account.salt, account.signingKey);
      return accountManager.address;
    }),
  );

  return {
    aztecNode,
    aztecNodeAdmin: undefined,
    sequencer: undefined,
    proverNode: undefined,
    deployL1ContractsValues,
    config,
    initialFundedAccounts,
    wallet,
    accounts: testAccounts,
    logger,
    cheatCodes,
    ethCheatCodes,
    prefilledPublicData: undefined,
    mockGossipSubNetwork: undefined,
    watcher: undefined,
    dateProvider: undefined,
    blobSink: undefined,
    telemetryClient: undefined,
    teardown,
  };
}

/** Options for the e2e tests setup */
export type SetupOptions = {
  /** State load */
  stateLoad?: string;
  /** Whether to enable metrics collection, if undefined, metrics collection is disabled */
  metricsPort?: number | undefined;
  /** Previously deployed contracts on L1 */
  deployL1ContractsValues?: DeployL1ContractsReturnType;
  /** Whether to skip deployment of protocol contracts (auth registry, etc) */
  skipProtocolContracts?: boolean;
  /** Initial fee juice for default accounts */
  initialAccountFeeJuice?: Fr;
  /** Number of initial accounts funded with fee juice */
  numberOfInitialFundedAccounts?: number;
  /** Data of the initial funded accounts */
  initialFundedAccounts?: InitialAccountData[];
  /** Salt to use in L1 contract deployment */
  salt?: number;
  /** An initial set of validators */
  initialValidators?: (Operator & { privateKey: `0x${string}` })[];
  /** Anvil Start time */
  l1StartTime?: number;
  /** The anvil time where we should at the earliest be seeing L2 blocks */
  l2StartTime?: number;
  /** Whether to start a prover node */
  startProverNode?: boolean;
  /** Whether to fund the rewardDistributor */
  fundRewardDistributor?: boolean;
  /** Manual config for the telemetry client */
  telemetryConfig?: Partial<TelemetryClientConfig> & { benchmark?: boolean };
  /** Public data that will be inserted in the tree in genesis */
  genesisPublicData?: PublicDataTreeLeaf[];
  /** Specific config for the prover node, if set. */
  proverNodeConfig?: Partial<ProverNodeConfig>;
  /** Whether to use a mock gossip sub network for p2p clients. */
  mockGossipSubNetwork?: boolean;
  /** Whether to disable the anvil test watcher (can still be manually started) */
  disableAnvilTestWatcher?: boolean;
  /** Whether to enable anvil automine during deployment of L1 contracts (consider defaulting this to true). */
  automineL1Setup?: boolean;
  /** How many accounts to seed and unlock in anvil. */
  anvilAccounts?: number;
  /** Port to start anvil (defaults to 8545) */
  anvilPort?: number;
  /** Key to use for publishing L1 contracts */
  l1PublisherKey?: SecretValue<`0x${string}`>;
} & Partial<AztecNodeConfig>;

/** Context for an end-to-end test as returned by the `setup` function */
export type EndToEndContext = {
  /** The Aztec Node service or client a connected to it. */
  aztecNode: AztecNode;
  /** Client to the Aztec Node admin interface (undefined if connected to remote environment) */
  aztecNodeAdmin?: AztecNodeAdmin;
  /** The prover node service (only set if startProverNode is true) */
  proverNode: ProverNode | undefined;
  /** A client to the sequencer service (undefined if connected to remote environment) */
  sequencer: SequencerClient | undefined;
  /** Return values from deployL1Contracts function. */
  deployL1ContractsValues: DeployL1ContractsReturnType;
  /** The Aztec Node configuration. */
  config: AztecNodeConfig;
  /** The data for the initial funded accounts. */
  initialFundedAccounts: InitialAccountData[];
  /** The wallet to be used. */
  wallet: TestWallet;
  /** The wallets to be used. */
  accounts: AztecAddress[];
  /** Logger instance named as the current test. */
  logger: Logger;
  /** The cheat codes. */
  cheatCodes: CheatCodes;
  /** The cheat codes for L1 */
  ethCheatCodes: EthCheatCodes;
  /** The anvil test watcher (undefined if connected to remote environment) */
  watcher: AnvilTestWatcher | undefined;
  /** Allows tweaking current system time, used by the epoch cache only (undefined if connected to remote environment) */
  dateProvider: TestDateProvider | undefined;
  /** The blob sink (undefined if connected to remote environment) */
  blobSink: BlobSinkServer | undefined;
  /** Telemetry client */
  telemetryClient: TelemetryClient | undefined;
  /** Mock gossip sub network used for gossipping messages (only if mockGossipSubNetwork was set to true in opts) */
  mockGossipSubNetwork: MockGossipSubNetwork | undefined;
  /** Prefilled public data used for setting up nodes. */
  prefilledPublicData: PublicDataTreeLeaf[] | undefined;
  /** Function to stop the started services. */
  teardown: () => Promise<void>;
};

/**
 * Sets up the environment for the end-to-end tests.
 * @param numberOfAccounts - The number of new accounts to be created once the PXE is initiated.
 * @param opts - Options to pass to the node initialization and to the setup script.
 * @param pxeOpts - Options to pass to the PXE initialization.
 */
export async function setup(
  numberOfAccounts = 1,
  opts: SetupOptions = {},
  pxeOpts: Partial<PXEConfig> = {},
  chain: Chain = foundry,
): Promise<EndToEndContext> {
  let anvil: Anvil | undefined;
  try {
    opts.aztecTargetCommitteeSize ??= 0;
    opts.slasherFlavor ??= 'none';

    const config: AztecNodeConfig & SetupOptions = { ...getConfigEnvVars(), ...opts };
    // use initialValidators for the node config
    config.validatorPrivateKeys = new SecretValue(opts.initialValidators?.map(v => v.privateKey) ?? []);

    config.peerCheckIntervalMS = TEST_PEER_CHECK_INTERVAL_MS;
    // For tests we only want proving enabled if specifically requested
    config.realProofs = !!opts.realProofs;
    // Only enforce the time table if requested
    config.enforceTimeTable = !!opts.enforceTimeTable;

    const logger = getLogger();

    // Create a temp directory for any services that need it and cleanup later
    const directoryToCleanup = path.join(tmpdir(), randomBytes(8).toString('hex'));
    await fs.mkdir(directoryToCleanup, { recursive: true });
    if (!config.dataDirectory) {
      config.dataDirectory = directoryToCleanup;
    }

    if (!config.l1RpcUrls?.length) {
      if (!isAnvilTestChain(chain.id)) {
        throw new Error(`No ETHEREUM_HOSTS set but non anvil chain requested`);
      }
      if (AZTEC_NODE_URL) {
        throw new Error(
          `AZTEC_NODE_URL provided but no ETHEREUM_HOSTS set. Refusing to run, please set both variables so tests can deploy L1 contracts to the same Anvil instance`,
        );
      }

      const res = await startAnvil({
        l1BlockTime: opts.ethereumSlotDuration,
        accounts: opts.anvilAccounts,
        port: opts.anvilPort,
      });
      anvil = res.anvil;
      config.l1RpcUrls = [res.rpcUrl];
    }

    // Enable logging metrics to a local file named after the test suite
    if (isMetricsLoggingRequested()) {
      const filename = path.join('log', getJobName() + '.jsonl');
      logger.info(`Logging metrics to ${filename}`);
      setupMetricsLogger(filename);
    }

    const dateProvider = new TestDateProvider();
    const ethCheatCodes = new EthCheatCodesWithState(config.l1RpcUrls, dateProvider);

    if (opts.stateLoad) {
      await ethCheatCodes.loadChainState(opts.stateLoad);
    }

    if (opts.l1StartTime) {
      await ethCheatCodes.warp(opts.l1StartTime, { resetBlockInterval: true });
    }

    let publisherPrivKey = undefined;
    let publisherHdAccount = undefined;

    if (opts.l1PublisherKey && opts.l1PublisherKey.getValue() && opts.l1PublisherKey.getValue() != NULL_KEY) {
      publisherHdAccount = privateKeyToAccount(opts.l1PublisherKey.getValue());
    } else if (
      config.publisherPrivateKeys &&
      config.publisherPrivateKeys.length > 0 &&
      config.publisherPrivateKeys[0].getValue() != NULL_KEY
    ) {
      publisherHdAccount = privateKeyToAccount(config.publisherPrivateKeys[0].getValue());
    } else if (!MNEMONIC) {
      throw new Error(`Mnemonic not provided and no publisher private key`);
    } else {
      publisherHdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
      const publisherPrivKeyRaw = publisherHdAccount.getHdKey().privateKey;
      publisherPrivKey = publisherPrivKeyRaw === null ? null : Buffer.from(publisherPrivKeyRaw);
      config.publisherPrivateKeys = [new SecretValue(`0x${publisherPrivKey!.toString('hex')}` as const)];
    }

    config.coinbase = EthAddress.fromString(publisherHdAccount.address);

    if (AZTEC_NODE_URL) {
      // we are setting up against a remote environment, l1 contracts are assumed to already be deployed
      return await setupWithRemoteEnvironment(publisherHdAccount!, config, logger, numberOfAccounts);
    }

    const initialFundedAccounts =
      opts.initialFundedAccounts ??
      (await generateSchnorrAccounts(opts.numberOfInitialFundedAccounts ?? numberOfAccounts));
    const { genesisArchiveRoot, prefilledPublicData, fundingNeeded } = await getGenesisValues(
      initialFundedAccounts.map(a => a.address),
      opts.initialAccountFeeJuice,
      opts.genesisPublicData,
    );

    const wasAutomining = await ethCheatCodes.isAutoMining();
    const enableAutomine = opts.automineL1Setup && !wasAutomining && isAnvilTestChain(chain.id);
    if (enableAutomine) {
      await ethCheatCodes.setAutomine(true);
    }

    const l1Client = createExtendedL1Client(config.l1RpcUrls, publisherHdAccount!, chain);
    await deployMulticall3(l1Client, logger);

    const deployL1ContractsValues =
      opts.deployL1ContractsValues ??
      (await setupL1Contracts(
        config.l1RpcUrls,
        publisherHdAccount!,
        logger,
        {
          ...opts,
          genesisArchiveRoot,
          feeJuicePortalInitialBalance: fundingNeeded,
          initialValidators: opts.initialValidators,
        },
        chain,
      ));

    config.l1Contracts = deployL1ContractsValues.l1ContractAddresses;
    config.rollupVersion = deployL1ContractsValues.rollupVersion;

    if (opts.fundRewardDistributor) {
      // Mints block rewards for 10000 blocks to the rewardDistributor contract

      const rollup = new RollupContract(
        deployL1ContractsValues.l1Client,
        deployL1ContractsValues.l1ContractAddresses.rollupAddress,
      );

      const blockReward = await rollup.getBlockReward();
      const mintAmount = 10_000n * (blockReward as bigint);

      const feeJuice = getContract({
        address: deployL1ContractsValues.l1ContractAddresses.feeJuiceAddress.toString(),
        abi: FeeAssetArtifact.contractAbi,
        client: deployL1ContractsValues.l1Client,
      });

      const rewardDistributorMintTxHash = await feeJuice.write.mint(
        [deployL1ContractsValues.l1ContractAddresses.rewardDistributorAddress.toString(), mintAmount],
        {} as any,
      );
      await deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash: rewardDistributorMintTxHash });
      logger.info(`Funding rewardDistributor in ${rewardDistributorMintTxHash}`);
    }

    if (enableAutomine) {
      await ethCheatCodes.setAutomine(false);
      await ethCheatCodes.setIntervalMining(config.ethereumSlotDuration);
      dateProvider.setTime((await ethCheatCodes.timestamp()) * 1000);
    }

    if (opts.l2StartTime) {
      // This should only be used in synching test or when you need to have a stable
      // timestamp for the first l2 block.
      await ethCheatCodes.warp(opts.l2StartTime, { resetBlockInterval: true });
    }

    const watcher = new AnvilTestWatcher(
      new EthCheatCodesWithState(config.l1RpcUrls, dateProvider),
      deployL1ContractsValues.l1ContractAddresses.rollupAddress,
      deployL1ContractsValues.l1Client,
      dateProvider,
    );
    if (!opts.disableAnvilTestWatcher) {
      await watcher.start();
    }

    const telemetry = getTelemetryClient(opts.telemetryConfig);

    // Blob sink service - blobs get posted here and served from here
    const blobSinkPort = await getPort();
    const blobSink = await createBlobSinkServer(
      {
        l1ChainId: config.l1ChainId,
        l1RpcUrls: config.l1RpcUrls,
        l1Contracts: config.l1Contracts,
        port: blobSinkPort,
        dataDirectory: config.dataDirectory,
        dataStoreMapSizeKB: config.dataStoreMapSizeKB,
      },
      telemetry,
    );
    await blobSink.start();
    config.blobSinkUrl = `http://localhost:${blobSinkPort}`;

    logger.verbose('Creating and synching an aztec node', config);

    const acvmConfig = await getACVMConfig(logger);
    if (acvmConfig) {
      config.acvmWorkingDirectory = acvmConfig.acvmWorkingDirectory;
      config.acvmBinaryPath = acvmConfig.acvmBinaryPath;
    }

    const bbConfig = await getBBConfig(logger);
    if (bbConfig) {
      config.bbBinaryPath = bbConfig.bbBinaryPath;
      config.bbWorkingDirectory = bbConfig.bbWorkingDirectory;
    }

    const blobSinkClient = createBlobSinkClient(config, { logger: createLogger('node:blob-sink:client') });

    let mockGossipSubNetwork: MockGossipSubNetwork | undefined;
    let p2pClientDeps: P2PClientDeps<P2PClientType.Full> | undefined = undefined;

    if (opts.mockGossipSubNetwork) {
      mockGossipSubNetwork = new MockGossipSubNetwork();
      p2pClientDeps = { p2pServiceFactory: getMockPubSubP2PServiceFactory(mockGossipSubNetwork) };
    }

    // Transactions built against the genesis state must be included in block 1, otherwise they are dropped.
    // To avoid test failures from dropped transactions, we ensure progression beyond genesis before proceeding.
    // For account deployments, we set minTxsPerBlock=1 and deploy accounts sequentially for guaranteed success.
    // If no accounts need deployment, we await an empty block to confirm network progression. After either path
    // completes, we restore the original minTxsPerBlock setting. The deployment and waiting for empty block is
    // handled by the if-else branches on line 632.
    // For more details on why the tx would be dropped see `validate_include_by_timestamp` function in
    // `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/validation_requests.nr`.
    //
    // Note: If the following seems too convoluted or if it starts making problems, we could drop the "progressing
    // past genesis via an account contract deployment" optimization and just call flush() on the sequencer and wait
    // for an empty block to be mined. This would simplify it all quite a bit but the setup would be slower for tests
    // deploying accounts.
    const originalMinTxsPerBlock = config.minTxsPerBlock;
    if (originalMinTxsPerBlock === undefined) {
      throw new Error('minTxsPerBlock is undefined in e2e test setup');
    }
    config.minTxsPerBlock = numberOfAccounts === 0 ? 0 : 1;

    config.p2pEnabled = opts.mockGossipSubNetwork || config.p2pEnabled;
    config.p2pIp = opts.p2pIp ?? config.p2pIp ?? '127.0.0.1';

    if (!config.disableValidator) {
      if ((config.validatorPrivateKeys?.getValue().length ?? 0) === 0) {
        config.validatorPrivateKeys = new SecretValue([generatePrivateKey()]);
      }
    }

    const aztecNode = await AztecNodeService.createAndSync(
      config, // REFACTOR: createAndSync mutates this config
      { dateProvider, blobSinkClient, telemetry, p2pClientDeps, logger: createLogger('node:MAIN-aztec-node') },
      { prefilledPublicData },
    );
    const sequencerClient = aztecNode.getSequencer();

    if (sequencerClient) {
      const publisher = (sequencerClient as TestSequencerClient).sequencer.publisher;
      publisher.l1TxUtils = DelayedTxUtils.fromL1TxUtils(publisher.l1TxUtils, config.ethereumSlotDuration, l1Client);
    }

    let proverNode: ProverNode | undefined = undefined;
    if (opts.startProverNode) {
      logger.verbose('Creating and syncing a simulated prover node...');
      const proverNodePrivateKey = getPrivateKeyFromIndex(2);
      const proverNodePrivateKeyHex: Hex = `0x${proverNodePrivateKey!.toString('hex')}`;
      const proverNodeDataDirectory = path.join(directoryToCleanup, randomBytes(8).toString('hex'));
      const proverNodeConfig = { ...config.proverNodeConfig, dataDirectory: proverNodeDataDirectory };
      proverNode = await createAndSyncProverNode(
        proverNodePrivateKeyHex,
        config,
        proverNodeConfig,
        aztecNode,
        prefilledPublicData,
      );
    }

    logger.verbose('Creating a pxe...');
    const { wallet, teardown: pxeTeardown } = await setupPXEAndGetWallet(aztecNode!, pxeOpts, logger);

    const cheatCodes = await CheatCodes.create(config.l1RpcUrls, aztecNode, dateProvider);

    if (
      (opts.aztecTargetCommitteeSize && opts.aztecTargetCommitteeSize > 0) ||
      (opts.initialValidators && opts.initialValidators.length > 0)
    ) {
      // We need to advance such that the committee is set up.
      await cheatCodes.rollup.advanceToEpoch((await cheatCodes.rollup.getEpoch()) + BigInt(config.lagInEpochs + 1));
      await cheatCodes.rollup.setupEpoch();
      await cheatCodes.rollup.debugRollup();
    }
    let accounts: AztecAddress[] = [];
    // Below we continue with what we described in the long comment on line 571.
    if (numberOfAccounts === 0) {
      logger.info('No accounts are being deployed, waiting for an empty block 1 to be mined');
      while ((await aztecNode.getBlockNumber()) === 0) {
        await sleep(2000);
      }
    } else {
      logger.info(
        `${numberOfAccounts} accounts are being deployed. Reliably progressing past genesis by setting minTxsPerBlock to 1 and waiting for the accounts to be deployed`,
      );
      const accountsData = initialFundedAccounts.slice(0, numberOfAccounts);
      const accountManagers = await deployFundedSchnorrAccounts(wallet, aztecNode, accountsData);
      accounts = accountManagers.map(accountManager => accountManager.address);
    }

    // Now we restore the original minTxsPerBlock setting.
    sequencerClient!.getSequencer().updateConfig({ minTxsPerBlock: originalMinTxsPerBlock });

    if (initialFundedAccounts.length < numberOfAccounts) {
      // TODO: Create (numberOfAccounts - initialFundedAccounts.length) wallets without funds.
      throw new Error(
        `Unable to deploy ${numberOfAccounts} accounts. Only ${initialFundedAccounts.length} accounts were funded.`,
      );
    }

    const teardown = async () => {
      try {
        await pxeTeardown();

        await tryStop(aztecNode, logger);
        await tryStop(proverNode, logger);

        if (acvmConfig?.cleanup) {
          await acvmConfig.cleanup();
        }

        if (bbConfig?.cleanup) {
          await bbConfig.cleanup();
        }

        await tryStop(watcher, logger);
        await tryStop(anvil, logger);

        await tryStop(blobSink, logger);
        await tryRmDir(directoryToCleanup, logger);
      } catch (err) {
        logger.error(`Error during e2e test teardown`, err);
      }
    };

    return {
      aztecNode,
      aztecNodeAdmin: aztecNode,
      blobSink,
      cheatCodes,
      ethCheatCodes,
      config,
      dateProvider,
      deployL1ContractsValues,
      initialFundedAccounts,
      logger,
      mockGossipSubNetwork,
      prefilledPublicData,
      proverNode,
      sequencer: sequencerClient,
      teardown,
      telemetryClient: telemetry,
      wallet,
      accounts,
      watcher,
    };
  } catch (err) {
    // TODO: Just hoisted anvil for now to ensure cleanup. Prob need to hoist the rest.
    await anvil?.stop();
    throw err;
  }
}

/**
 * Registers the contract class used for test accounts and publicly deploys the instances requested.
 * Use this when you need to make a public call to an account contract, such as for requesting a public authwit.
 * @param sender - Wallet to send the deployment tx.
 * @param accountsToDeploy - Which accounts to publicly deploy.
 */

export async function ensureAccountContractsPublished(wallet: Wallet, accountsToDeploy: AztecAddress[]) {
  // We have to check whether the accounts are already deployed. This can happen if the test runs against
  // the sandbox and the test accounts exist
  const accountsAndAddresses = await Promise.all(
    accountsToDeploy.map(async address => {
      return {
        address,
        deployed: (await wallet.getContractMetadata(address)).isContractPublished,
      };
    }),
  );
  const instances = (
    await Promise.all(
      accountsAndAddresses
        .filter(({ deployed }) => !deployed)
        .map(({ address }) => wallet.getContractMetadata(address)),
    )
  ).map(contractMetadata => contractMetadata.contractInstance);
  const contractClass = await getContractClassFromArtifact(SchnorrAccountContractArtifact);
  if (!(await wallet.getContractClassMetadata(contractClass.id, true)).isContractClassPubliclyRegistered) {
    await (await publishContractClass(wallet, SchnorrAccountContractArtifact))
      .send({ from: accountsToDeploy[0] })
      .wait();
  }
  const requests = await Promise.all(instances.map(async instance => await publishInstance(wallet, instance!)));
  const batch = new BatchCall(wallet, requests);
  await batch.send({ from: accountsToDeploy[0] }).wait();
}

/** Returns the job name for the current test. */
function getJobName() {
  return process.env.JOB_NAME ?? expect.getState().currentTestName?.split(' ')[0].replaceAll('/', '_') ?? 'unknown';
}

/**
 * Returns a logger instance for the current test.
 * @returns a logger instance for the current test.
 */
export function getLogger() {
  const describeBlockName = expect.getState().currentTestName?.split(' ')[0].replaceAll('/', ':');
  if (!describeBlockName) {
    const name = expect.getState().testPath?.split('/').pop()?.split('.')[0] ?? 'unknown';
    return createLogger('e2e:' + name);
  }
  return createLogger('e2e:' + describeBlockName);
}

export type BalancesFn = ReturnType<typeof getBalancesFn>;
export function getBalancesFn(
  symbol: string,
  method: ContractMethod,
  from: AztecAddress,
  logger: any,
): (...addresses: (AztecAddress | { address: AztecAddress })[]) => Promise<bigint[]> {
  const balances = async (...addressLikes: (AztecAddress | { address: AztecAddress })[]) => {
    const addresses = addressLikes.map(addressLike => ('address' in addressLike ? addressLike.address : addressLike));
    const b = await Promise.all(addresses.map(address => method(address).simulate({ from })));
    const debugString = `${symbol} balances: ${addresses.map((address, i) => `${address}: ${b[i]}`).join(', ')}`;
    logger.verbose(debugString);
    return b;
  };

  return balances;
}

export async function expectMapping<K, V>(
  fn: (...k: K[]) => Promise<V[]>,
  inputs: K[],
  expectedOutputs: V[],
): Promise<void> {
  expect(inputs.length).toBe(expectedOutputs.length);

  const outputs = await fn(...inputs);

  expect(outputs).toEqual(expectedOutputs);
}

export async function expectMappingDelta<K, V extends number | bigint>(
  initialValues: V[],
  fn: (...k: K[]) => Promise<V[]>,
  inputs: K[],
  expectedDiffs: V[],
): Promise<void> {
  expect(inputs.length).toBe(expectedDiffs.length);

  const outputs = await fn(...inputs);
  const diffs = outputs.map((output, i) => output - initialValues[i]);

  expect(diffs).toEqual(expectedDiffs);
}

/**
 * Computes the address of the "canonical" SponsoredFPCContract. This is not a protocol contract
 * but by conventions its address is computed with a salt of 0.
 * @returns The address of the sponsored FPC contract
 */
export function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return Promise.resolve(
    getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
      salt: new Fr(SPONSORED_FPC_SALT),
    }),
  );
}

/**
 * Computes the address of the "canonical" SponsoredFPCContract. This is not a protocol contract
 * but by conventions its address is computed with a salt of 0.
 * @returns The address of the sponsored FPC contract
 */
export async function getSponsoredFPCAddress() {
  const sponsoredFPCInstance = await getSponsoredFPCInstance();
  return sponsoredFPCInstance.address;
}

/**
 * Deploy a sponsored FPC contract to a running instance.
 */
export async function setupSponsoredFPC(wallet: Wallet) {
  const instance = await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  });

  await wallet.registerContract({ instance, artifact: SponsoredFPCContract.artifact });
  getLogger().info(`SponsoredFPC: ${instance.address}`);
  return instance;
}

/**
 * Registers the SponsoredFPC in this PXE instance
 * @param wallet - The wallet
 */
export async function registerSponsoredFPC(wallet: Wallet): Promise<void> {
  await wallet.registerContract({ instance: await getSponsoredFPCInstance(), artifact: SponsoredFPCContract.artifact });
}

export async function waitForProvenChain(node: AztecNode, targetBlock?: number, timeoutSec = 60, intervalSec = 1) {
  targetBlock ??= await node.getBlockNumber();

  await retryUntil(
    async () => (await node.getProvenBlockNumber()) >= targetBlock,
    'proven chain status',
    timeoutSec,
    intervalSec,
  );
}

export function createAndSyncProverNode(
  proverNodePrivateKey: `0x${string}`,
  aztecNodeConfig: AztecNodeConfig,
  proverNodeConfig: Partial<ProverNodeConfig> & Pick<DataStoreConfig, 'dataDirectory'> & { dontStart?: boolean },
  aztecNode: AztecNode | undefined,
  prefilledPublicData: PublicDataTreeLeaf[] = [],
  proverNodeDeps: ProverNodeDeps = {},
) {
  return withLogNameSuffix('prover-node', async () => {
    // Disable stopping the aztec node as the prover coordination test will kill it otherwise
    // This is only required when stopping the prover node for testing
    const aztecNodeTxProvider = aztecNode && {
      getTxByHash: aztecNode.getTxByHash.bind(aztecNode),
      getTxsByHash: aztecNode.getTxsByHash.bind(aztecNode),
      stop: () => Promise.resolve(),
    };

    const blobSinkClient = createBlobSinkClient(aztecNodeConfig);

    // Creating temp store and archiver for simulated prover node
    const archiverConfig = { ...aztecNodeConfig, dataDirectory: proverNodeConfig.dataDirectory };
    const archiver = await createArchiver(archiverConfig, { blobSinkClient }, { blockUntilSync: true });

    // Prover node config is for simulated proofs
    const proverConfig: ProverNodeConfig = {
      ...aztecNodeConfig,
      txCollectionNodeRpcUrls: [],
      realProofs: false,
      proverAgentCount: 2,
      publisherPrivateKeys: [new SecretValue(proverNodePrivateKey)],
      proverNodeMaxPendingJobs: 10,
      proverNodeMaxParallelBlocksPerEpoch: 32,
      proverNodePollingIntervalMs: 200,
      txGatheringIntervalMs: 1000,
      txGatheringBatchSize: 10,
      txGatheringMaxParallelRequestsPerNode: 10,
      txGatheringTimeoutMs: 24_000,
      proverNodeFailedEpochStore: undefined,
      proverId: EthAddress.fromNumber(1),
      proverNodeEpochProvingDelayMs: undefined,
      ...proverNodeConfig,
    };

    const l1TxUtils = createDelayedL1TxUtils(
      aztecNodeConfig,
      proverNodePrivateKey,
      'prover-node',
      proverNodeDeps.dateProvider,
    );

    const proverNode = await createProverNode(
      proverConfig,
      { ...proverNodeDeps, aztecNodeTxProvider, archiver: archiver as Archiver, l1TxUtils },
      { prefilledPublicData },
    );
    getLogger().info(`Created and synced prover node`, { publisherAddress: l1TxUtils.client.account!.address });
    if (!proverNodeConfig.dontStart) {
      await proverNode.start();
    }
    return proverNode;
  });
}

function createDelayedL1TxUtils(
  aztecNodeConfig: AztecNodeConfig,
  privateKey: `0x${string}`,
  logName: string,
  dateProvider?: DateProvider,
) {
  const l1Client = createExtendedL1Client(aztecNodeConfig.l1RpcUrls, privateKey, foundry);

  const log = createLogger(logName);
  const l1TxUtils = createDelayedL1TxUtilsFromViemWallet(l1Client, log, dateProvider, aztecNodeConfig);
  l1TxUtils.enableDelayer(aztecNodeConfig.ethereumSlotDuration);
  return l1TxUtils;
}
