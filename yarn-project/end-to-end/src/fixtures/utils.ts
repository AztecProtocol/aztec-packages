import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';
import {
  type InitialAccountData,
  deployFundedSchnorrAccounts,
  generateSchnorrAccounts,
  getDeployedTestAccounts,
  getDeployedTestAccountsWallets,
} from '@aztec/accounts/testing';
import { type Archiver, createArchiver } from '@aztec/archiver';
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import {
  AccountManager,
  type AccountWalletWithSecretKey,
  type AztecAddress,
  type AztecNode,
  BatchCall,
  type ContractMethod,
  type Logger,
  type PXE,
  type Wallet,
  createAztecNodeClient,
  createLogger,
  createPXEClient,
  makeFetch,
  sleep,
  waitForPXE,
} from '@aztec/aztec.js';
import { deployInstance, registerContractClass } from '@aztec/aztec.js/deployment';
import { AnvilTestWatcher, CheatCodes } from '@aztec/aztec.js/testing';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import { type BlobSinkServer, createBlobSinkServer } from '@aztec/blob-sink/server';
import { GENESIS_ARCHIVE_ROOT, SPONSORED_FPC_SALT } from '@aztec/constants';
import {
  type DeployL1ContractsArgs,
  type DeployL1ContractsReturnType,
  NULL_KEY,
  type Operator,
  createExtendedL1Client,
  deployL1Contracts,
  deployMulticall3,
  getL1ContractsConfigEnvVars,
  isAnvilTestChain,
  l1Artifacts,
} from '@aztec/ethereum';
import { DelayedTxUtils, EthCheatCodesWithState, startAnvil } from '@aztec/ethereum/test';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { tryRmDir } from '@aztec/foundation/fs';
import { withLogNameSuffix } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { TestDateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import type { P2PClientDeps } from '@aztec/p2p';
import { MockGossipSubNetwork, getMockPubSubP2PServiceFactory } from '@aztec/p2p/test-helpers';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { type ProverNode, type ProverNodeConfig, createProverNode } from '@aztec/prover-node';
import {
  type PXEService,
  type PXEServiceConfig,
  createPXEServiceWithSimulator,
  getPXEServiceConfig,
} from '@aztec/pxe/server';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import { MemoryCircuitRecorder, SimulatorRecorderWrapper, WASMSimulator } from '@aztec/simulator/client';
import { FileCircuitRecorder } from '@aztec/simulator/testing';
import { getContractClassFromArtifact, getContractInstanceFromDeployParams } from '@aztec/stdlib/contract';
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
import { getGenesisValues } from '@aztec/world-state/testing';

import type { Anvil } from '@viem/anvil';
import fs from 'fs/promises';
import getPort from 'get-port';
import { tmpdir } from 'os';
import * as path from 'path';
import { type Chain, type HDAccount, type Hex, type PrivateKeyAccount, getContract } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { MNEMONIC, TEST_PEER_CHECK_INTERVAL_MS } from './fixtures.js';
import { getACVMConfig } from './get_acvm_config.js';
import { getBBConfig } from './get_bb_config.js';
import { isMetricsLoggingRequested, setupMetricsLogger } from './logging.js';

export { deployAndInitializeTokenAndBridgeContracts } from '../shared/cross_chain_test_harness.js';
export { startAnvil };

const { PXE_URL = '' } = process.env;
const getAztecUrl = () => PXE_URL;

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
    protocolContractTreeRoot,
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
 * Sets up Private eXecution Environment (PXE).
 * @param aztecNode - An instance of Aztec Node.
 * @param opts - Partial configuration for the PXE service.
 * @param logger - The logger to be used.
 * @param useLogSuffix - Whether to add a randomly generated suffix to the PXE debug logs.
 * @returns Private eXecution Environment (PXE), logger and teardown function.
 */
export async function setupPXEService(
  aztecNode: AztecNode,
  opts: Partial<PXEServiceConfig> = {},
  logger = getLogger(),
  useLogSuffix = false,
): Promise<{
  /**
   * The PXE instance.
   */
  pxe: PXEService;
  /**
   * Logger instance named as the current test.
   */
  logger: Logger;
  /**
   * Teardown function
   */
  teardown: () => Promise<void>;
}> {
  const pxeServiceConfig = { ...getPXEServiceConfig(), ...opts };
  // For tests we only want proving enabled if specifically requested
  pxeServiceConfig.proverEnabled = !!opts.proverEnabled;

  // If no data directory provided, create a temp directory and clean up afterwards
  const configuredDataDirectory = pxeServiceConfig.dataDirectory;
  if (!configuredDataDirectory) {
    pxeServiceConfig.dataDirectory = path.join(tmpdir(), randomBytes(8).toString('hex'));
  }

  const simulator = new WASMSimulator();
  const recorder = process.env.CIRCUIT_RECORD_DIR
    ? new FileCircuitRecorder(process.env.CIRCUIT_RECORD_DIR)
    : new MemoryCircuitRecorder();
  const simulatorWithRecorder = new SimulatorRecorderWrapper(simulator, recorder);
  const pxe = await createPXEServiceWithSimulator(aztecNode, simulatorWithRecorder, pxeServiceConfig, {
    useLogSuffix,
  });

  const teardown = configuredDataDirectory ? () => Promise.resolve() : () => tryRmDir(pxeServiceConfig.dataDirectory!);

  return {
    pxe,
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
  logger.verbose(`Creating PXE client to remote host ${PXE_URL}`);
  const pxeClient = createPXEClient(PXE_URL, {}, makeFetch([1, 2, 3], true));
  await waitForPXE(pxeClient, logger);
  logger.verbose('JSON RPC client connected to PXE');
  logger.verbose(`Retrieving contract addresses from ${PXE_URL}`);
  const { l1ContractAddresses, rollupVersion } = await pxeClient.getNodeInfo();

  const l1Client = createExtendedL1Client(config.l1RpcUrls, account, foundry);

  const deployL1ContractsValues: DeployL1ContractsReturnType = {
    l1ContractAddresses,
    l1Client,
    rollupVersion,
  };
  const cheatCodes = await CheatCodes.create(config.l1RpcUrls, pxeClient!);
  const teardown = () => Promise.resolve();

  logger.verbose('Constructing available wallets from already registered accounts...');
  const initialFundedAccounts = await getDeployedTestAccounts(pxeClient);
  const wallets = await getDeployedTestAccountsWallets(pxeClient);

  if (wallets.length < numberOfAccounts) {
    throw new Error(`Required ${numberOfAccounts} accounts. Found ${wallets.length}.`);
    // Deploy new accounts if there's a test that requires more funded accounts in the remote environment.
  }

  return {
    aztecNode,
    aztecNodeAdmin: undefined,
    sequencer: undefined,
    proverNode: undefined,
    pxe: pxeClient,
    deployL1ContractsValues,
    config,
    initialFundedAccounts,
    wallet: wallets[0],
    wallets: wallets.slice(0, numberOfAccounts),
    logger,
    cheatCodes,
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
  /** The Private eXecution Environment (PXE). */
  pxe: PXE;
  /** Return values from deployL1Contracts function. */
  deployL1ContractsValues: DeployL1ContractsReturnType;
  /** The Aztec Node configuration. */
  config: AztecNodeConfig;
  /** The data for the initial funded accounts. */
  initialFundedAccounts: InitialAccountData[];
  /** The first wallet to be used. */
  wallet: AccountWalletWithSecretKey;
  /** The wallets to be used. */
  wallets: AccountWalletWithSecretKey[];
  /** Logger instance named as the current test. */
  logger: Logger;
  /** The cheat codes. */
  cheatCodes: CheatCodes;
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
  opts: SetupOptions = {
    customForwarderContractAddress: EthAddress.ZERO,
  },
  pxeOpts: Partial<PXEServiceConfig> = {},
  chain: Chain = foundry,
): Promise<EndToEndContext> {
  let anvil: Anvil | undefined;
  try {
    opts.aztecTargetCommitteeSize ??= 0;

    const config = { ...getConfigEnvVars(), ...opts };
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
      if (PXE_URL) {
        throw new Error(
          `PXE_URL provided but no ETHEREUM_HOSTS set. Refusing to run, please set both variables so tests can deploy L1 contracts to the same Anvil instance`,
        );
      }

      const res = await startAnvil({ l1BlockTime: opts.ethereumSlotDuration });
      anvil = res.anvil;
      config.l1RpcUrls = [res.rpcUrl];
    }

    // Enable logging metrics to a local file named after the test suite
    if (isMetricsLoggingRequested()) {
      const filename = path.join('log', getJobName() + '.jsonl');
      logger.info(`Logging metrics to ${filename}`);
      setupMetricsLogger(filename);
    }

    const ethCheatCodes = new EthCheatCodesWithState(config.l1RpcUrls);

    if (opts.stateLoad) {
      await ethCheatCodes.loadChainState(opts.stateLoad);
    }

    if (opts.l1StartTime) {
      await ethCheatCodes.warp(opts.l1StartTime);
    }

    let publisherPrivKey = undefined;
    let publisherHdAccount = undefined;

    if (config.publisherPrivateKey && config.publisherPrivateKey.getValue() != NULL_KEY) {
      publisherHdAccount = privateKeyToAccount(config.publisherPrivateKey.getValue());
    } else if (!MNEMONIC) {
      throw new Error(`Mnemonic not provided and no publisher private key`);
    } else {
      publisherHdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
      const publisherPrivKeyRaw = publisherHdAccount.getHdKey().privateKey;
      publisherPrivKey = publisherPrivKeyRaw === null ? null : Buffer.from(publisherPrivKeyRaw);
      config.publisherPrivateKey = new SecretValue(`0x${publisherPrivKey!.toString('hex')}` as const);
    }

    if (PXE_URL) {
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

      const rewardDistributor = getContract({
        address: deployL1ContractsValues.l1ContractAddresses.rewardDistributorAddress.toString(),
        abi: l1Artifacts.rewardDistributor.contractAbi,
        client: deployL1ContractsValues.l1Client,
      });

      const blockReward = await rewardDistributor.read.BLOCK_REWARD();
      const mintAmount = 10_000n * (blockReward as bigint);

      const feeJuice = getContract({
        address: deployL1ContractsValues.l1ContractAddresses.feeJuiceAddress.toString(),
        abi: l1Artifacts.feeAsset.contractAbi,
        client: deployL1ContractsValues.l1Client,
      });

      const rewardDistributorMintTxHash = await feeJuice.write.mint([rewardDistributor.address, mintAmount], {} as any);
      await deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash: rewardDistributorMintTxHash });
      logger.info(`Funding rewardDistributor in ${rewardDistributorMintTxHash}`);
    }

    if (enableAutomine) {
      await ethCheatCodes.setAutomine(false);
      await ethCheatCodes.setIntervalMining(config.ethereumSlotDuration);
    }

    if (opts.l2StartTime) {
      // This should only be used in synching test or when you need to have a stable
      // timestamp for the first l2 block.
      await ethCheatCodes.warp(opts.l2StartTime);
    }

    const dateProvider = new TestDateProvider();
    dateProvider.setTime((await ethCheatCodes.timestamp()) * 1000);

    const watcher = new AnvilTestWatcher(
      new EthCheatCodesWithState(config.l1RpcUrls),
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

    logger.verbose('Creating and synching an aztec node...');

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
    config.l1PublishRetryIntervalMS = 100;

    const blobSinkClient = createBlobSinkClient(config, { logger: createLogger('node:blob-sink:client') });

    let mockGossipSubNetwork: MockGossipSubNetwork | undefined;
    let p2pClientDeps: P2PClientDeps<P2PClientType.Full> | undefined = undefined;

    if (opts.mockGossipSubNetwork) {
      mockGossipSubNetwork = new MockGossipSubNetwork();
      p2pClientDeps = { p2pServiceFactory: getMockPubSubP2PServiceFactory(mockGossipSubNetwork) };
    }

    config.p2pEnabled = opts.mockGossipSubNetwork || config.p2pEnabled;
    config.p2pIp = opts.p2pIp ?? config.p2pIp ?? '127.0.0.1';
    const aztecNode = await AztecNodeService.createAndSync(
      config, // REFACTOR: createAndSync mutates this config
      { dateProvider, blobSinkClient, telemetry, p2pClientDeps, logger: createLogger('node:MAIN-aztec-node') },
      { prefilledPublicData },
    );
    const sequencerClient = aztecNode.getSequencer();

    if (sequencerClient) {
      const publisher = (sequencerClient as TestSequencerClient).sequencer.publisher;
      publisher.l1TxUtils = DelayedTxUtils.fromL1TxUtils(publisher.l1TxUtils, config.ethereumSlotDuration);
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
    const { pxe, teardown: pxeTeardown } = await setupPXEService(aztecNode!, pxeOpts, logger);

    const cheatCodes = await CheatCodes.create(config.l1RpcUrls, pxe!);

    if (
      (opts.aztecTargetCommitteeSize && opts.aztecTargetCommitteeSize > 0) ||
      (opts.initialValidators && opts.initialValidators.length > 0)
    ) {
      // We need to advance to epoch 2 such that the committee is set up.
      logger.info(`Advancing to epoch 2`);
      await cheatCodes.rollup.advanceToEpoch(2n, { updateDateProvider: dateProvider });
      await cheatCodes.rollup.setupEpoch();
      await cheatCodes.rollup.debugRollup();
    }

    const sequencer = sequencerClient!.getSequencer();
    const minTxsPerBlock = config.minTxsPerBlock;

    if (minTxsPerBlock === undefined) {
      throw new Error('minTxsPerBlock is undefined in e2e test setup');
    }

    // Transactions built against the genesis state must be included in block 1, otherwise they are dropped.
    // To avoid test failures from dropped transactions, we ensure progression beyond genesis before proceeding.
    // For account deployments, we set minTxsPerBlock=1 and deploy accounts sequentially for guaranteed success.
    // If no accounts need deployment, we await an empty block to confirm network progression. After either path
    // completes, we restore the original minTxsPerBlock setting.
    // For more details on why the tx would be dropped see `validate_include_by_timestamp` function in
    // `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/validation_requests.nr`.
    let accountManagers: AccountManager[] = [];
    if (numberOfAccounts === 0) {
      // We wait until block 1 is mined to ensure that the network has progressed past genesis.
      sequencer.updateConfig({ minTxsPerBlock: 0 });
      while ((await pxe.getBlockNumber()) === 0) {
        await sleep(2000);
      }
    } else {
      sequencer.updateConfig({ minTxsPerBlock: 1 });
      accountManagers = await deployFundedSchnorrAccounts(pxe, initialFundedAccounts.slice(0, numberOfAccounts));
    }

    sequencer.updateConfig({ minTxsPerBlock });

    const wallets = await Promise.all(accountManagers.map(account => account.getWallet()));
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

        await tryStop(anvil, logger);
        await tryStop(watcher, logger);
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
      config,
      dateProvider,
      deployL1ContractsValues,
      initialFundedAccounts,
      logger,
      mockGossipSubNetwork,
      prefilledPublicData,
      proverNode,
      pxe,
      sequencer: sequencerClient,
      teardown,
      telemetryClient: telemetry,
      wallet: wallets[0],
      wallets,
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

// docs:start:public_deploy_accounts
export async function ensureAccountsPubliclyDeployed(sender: Wallet, accountsToDeploy: Wallet[]) {
  // We have to check whether the accounts are already deployed. This can happen if the test runs against
  // the sandbox and the test accounts exist
  const accountsAndAddresses = await Promise.all(
    accountsToDeploy.map(async account => {
      const address = account.getAddress();
      return {
        address,
        deployed: (await sender.getContractMetadata(address)).isContractPubliclyDeployed,
      };
    }),
  );
  const instances = (
    await Promise.all(
      accountsAndAddresses
        .filter(({ deployed }) => !deployed)
        .map(({ address }) => sender.getContractMetadata(address)),
    )
  ).map(contractMetadata => contractMetadata.contractInstance);
  const contractClass = await getContractClassFromArtifact(SchnorrAccountContractArtifact);
  if (!(await sender.getContractClassMetadata(contractClass.id, true)).isContractClassPubliclyRegistered) {
    await (await registerContractClass(sender, SchnorrAccountContractArtifact)).send().wait();
  }
  const requests = await Promise.all(instances.map(async instance => await deployInstance(sender, instance!)));
  const batch = new BatchCall(sender, requests);
  await batch.send().wait();
}
// docs:end:public_deploy_accounts

/**
 * Sets the timestamp of the next block.
 * @param rpcUrl - rpc url of the blockchain instance to connect to
 * @param timestamp - the timestamp for the next block
 */
export async function setNextBlockTimestamp(rpcUrl: string, timestamp: number) {
  const params = `[${timestamp}]`;
  await fetch(rpcUrl, {
    body: `{"jsonrpc":"2.0", "method": "evm_setNextBlockTimestamp", "params": ${params}, "id": 1}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
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
  logger: any,
): (...addresses: (AztecAddress | { address: AztecAddress })[]) => Promise<bigint[]> {
  const balances = async (...addressLikes: (AztecAddress | { address: AztecAddress })[]) => {
    const addresses = addressLikes.map(addressLike => ('address' in addressLike ? addressLike.address : addressLike));
    const b = await Promise.all(addresses.map(address => method(address).simulate()));
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
 * Computes the address of the "canonical" SponosoredFPCContract. This is not a protocol contract
 * but by conventions its address is computed with a salt of 0.
 * @returns The address of the sponsored FPC contract
 */
export async function getSponsoredFPCAddress() {
  const sponsoredFPCInstance = await getContractInstanceFromDeployParams(SponsoredFPCContract.artifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  });
  return sponsoredFPCInstance.address;
}

/**
 * Deploy a sponsored FPC contract to a running instance.
 */
export async function setupSponsoredFPC(pxe: PXE) {
  const instance = await getContractInstanceFromDeployParams(SponsoredFPCContract.artifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  });

  await pxe.registerContract({ instance, artifact: SponsoredFPCContract.artifact });
  getLogger().info(`SponsoredFPC: ${instance.address}`);
  return instance;
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
  proverNodeConfig: Partial<ProverNodeConfig> & Pick<DataStoreConfig, 'dataDirectory'>,
  aztecNode: AztecNode,
  prefilledPublicData: PublicDataTreeLeaf[] = [],
) {
  return withLogNameSuffix('prover-node', async () => {
    // Disable stopping the aztec node as the prover coordination test will kill it otherwise
    // This is only required when stopping the prover node for testing
    const aztecNodeTxProvider = {
      getTxByHash: aztecNode.getTxByHash.bind(aztecNode),
      getTxsByHash: aztecNode.getTxsByHash.bind(aztecNode),
      stop: () => Promise.resolve(),
    };

    const blobSinkClient = createBlobSinkClient(aztecNodeConfig);

    // Creating temp store and archiver for simulated prover node
    const archiverConfig = { ...aztecNodeConfig, dataDirectory: proverNodeConfig.dataDirectory };
    const archiver = await createArchiver(archiverConfig, blobSinkClient, { blockUntilSync: true });

    // Prover node config is for simulated proofs
    const proverConfig: ProverNodeConfig = {
      ...aztecNodeConfig,
      proverCoordinationNodeUrls: [],
      realProofs: false,
      proverAgentCount: 2,
      publisherPrivateKey: new SecretValue(proverNodePrivateKey),
      proverNodeMaxPendingJobs: 10,
      proverNodeMaxParallelBlocksPerEpoch: 32,
      proverNodePollingIntervalMs: 200,
      txGatheringIntervalMs: 1000,
      txGatheringBatchSize: 10,
      txGatheringMaxParallelRequestsPerNode: 10,
      proverNodeFailedEpochStore: undefined,
      ...proverNodeConfig,
    };

    const l1TxUtils = createDelayedL1TxUtils(aztecNodeConfig, proverNodePrivateKey, 'prover-node');

    const proverNode = await createProverNode(
      proverConfig,
      { aztecNodeTxProvider, archiver: archiver as Archiver, l1TxUtils },
      { prefilledPublicData },
    );
    getLogger().info(`Created and synced prover node`, { publisherAddress: l1TxUtils.client.account!.address });
    await proverNode.start();
    return proverNode;
  });
}

function createDelayedL1TxUtils(aztecNodeConfig: AztecNodeConfig, privateKey: `0x${string}`, logName: string) {
  const l1Client = createExtendedL1Client(aztecNodeConfig.l1RpcUrls, privateKey, foundry);

  const log = createLogger(logName);
  const l1TxUtils = new DelayedTxUtils(l1Client, log, aztecNodeConfig);
  l1TxUtils.enableDelayer(aztecNodeConfig.ethereumSlotDuration);
  return l1TxUtils;
}
