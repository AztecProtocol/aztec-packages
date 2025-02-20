import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';
import {
  deployFundedSchnorrAccounts,
  generateSchnorrAccounts,
  getDeployedTestAccounts,
  getDeployedTestAccountsWallets,
} from '@aztec/accounts/testing';
import type { InitialAccountData } from '@aztec/accounts/testing';
import { createArchiver } from '@aztec/archiver';
import type { Archiver } from '@aztec/archiver';
import { AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import type { AztecNodeConfig } from '@aztec/aztec-node';
import {
  AnvilTestWatcher,
  BatchCall,
  CheatCodes,
  FeeJuicePaymentMethod,
  SignerlessWallet,
  createAztecNodeClient,
  createLogger,
  createPXEClient,
  deployL1Contracts,
  makeFetch,
  waitForPXE,
} from '@aztec/aztec.js';
import type {
  AccountWalletWithSecretKey,
  AztecAddress,
  AztecNode,
  ContractMethod,
  DeployL1Contracts,
  Logger,
  PXE,
  Wallet,
} from '@aztec/aztec.js';
import { deployInstance, registerContractClass } from '@aztec/aztec.js/deployment';
import type { BBNativePrivateKernelProver } from '@aztec/bb-prover';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import { createBlobSinkServer } from '@aztec/blob-sink/server';
import type { BlobSinkServer } from '@aztec/blob-sink/server';
import { Fr, Gas, getContractClassFromArtifact } from '@aztec/circuits.js';
import type { PublicDataTreeLeaf } from '@aztec/circuits.js/trees';
import { FEE_JUICE_INITIAL_MINT, GENESIS_ARCHIVE_ROOT, GENESIS_BLOCK_HASH } from '@aztec/constants';
import {
  ForwarderContract,
  NULL_KEY,
  createL1Clients,
  getL1ContractsConfigEnvVars,
  isAnvilTestChain,
  l1Artifacts,
} from '@aztec/ethereum';
import type { DeployL1ContractsArgs } from '@aztec/ethereum';
import { DelayedTxUtils, EthCheatCodesWithState, startAnvil } from '@aztec/ethereum/test';
import { randomBytes } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { retryUntil } from '@aztec/foundation/retry';
import { TestDateProvider } from '@aztec/foundation/timer';
import { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { ProtocolContractAddress, protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { createProverNode } from '@aztec/prover-node';
import type { ProverNode, ProverNodeConfig } from '@aztec/prover-node';
import { createPXEService, getPXEServiceConfig } from '@aztec/pxe';
import type { PXEService, PXEServiceConfig } from '@aztec/pxe';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import { getConfigEnvVars as getTelemetryConfig, initTelemetryClient } from '@aztec/telemetry-client';
import type { TelemetryClient, TelemetryClientConfig } from '@aztec/telemetry-client';
import { BenchmarkTelemetryClient } from '@aztec/telemetry-client/bench';
import { getGenesisValues } from '@aztec/world-state/testing';

import type { Anvil } from '@viem/anvil';
import fs from 'fs/promises';
import getPort from 'get-port';
import { tmpdir } from 'os';
import * as path from 'path';
import { inspect } from 'util';
import { createPublicClient, createWalletClient, getContract, http } from 'viem';
import type { Account, Chain, HDAccount, Hex, HttpTransport, PrivateKeyAccount } from 'viem';
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
  l1RpcUrl: string,
  account: HDAccount | PrivateKeyAccount,
  logger: Logger,
  args: Partial<DeployL1ContractsArgs> = {},
  chain: Chain = foundry,
) => {
  const l1Data = await deployL1Contracts(l1RpcUrl, account, chain, logger, {
    l2FeeJuiceAddress: ProtocolContractAddress.FeeJuice.toField(),
    vkTreeRoot: getVKTreeRoot(),
    protocolContractTreeRoot,
    genesisArchiveRoot: args.genesisArchiveRoot ?? new Fr(GENESIS_ARCHIVE_ROOT),
    genesisBlockHash: args.genesisBlockHash ?? new Fr(GENESIS_BLOCK_HASH),
    salt: args.salt,
    initialValidators: args.initialValidators,
    assumeProvenThrough: args.assumeProvenThrough,
    ...getL1ContractsConfigEnvVars(),
    ...args,
  });

  return l1Data;
};

/**
 * Sets up Private eXecution Environment (PXE).
 * @param aztecNode - An instance of Aztec Node.
 * @param opts - Partial configuration for the PXE service.
 * @param firstPrivKey - The private key of the first account to be created.
 * @param logger - The logger to be used.
 * @param useLogSuffix - Whether to add a randomly generated suffix to the PXE debug logs.
 * @param proofCreator - An optional proof creator to use
 * @returns Private eXecution Environment (PXE), accounts, wallets and logger.
 */
export async function setupPXEService(
  aztecNode: AztecNode,
  opts: Partial<PXEServiceConfig> = {},
  logger = getLogger(),
  useLogSuffix = false,
  proofCreator?: BBNativePrivateKernelProver,
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

  // If no data directory provided, create a temp directory and clean up afterwards
  const configuredDataDirectory = pxeServiceConfig.dataDirectory;
  if (!configuredDataDirectory) {
    pxeServiceConfig.dataDirectory = path.join(tmpdir(), randomBytes(8).toString('hex'));
  }

  const pxe = await createPXEService(aztecNode, pxeServiceConfig, useLogSuffix, proofCreator);

  const teardown = async () => {
    if (!configuredDataDirectory) {
      await fs.rm(pxeServiceConfig.dataDirectory!, { recursive: true, force: true });
    }
  };

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
  account: Account,
  config: AztecNodeConfig,
  logger: Logger,
  numberOfAccounts: number,
) {
  // we are setting up against a remote environment, l1 contracts are already deployed
  const aztecNodeUrl = getAztecUrl();
  logger.verbose(`Creating Aztec Node client to remote host ${aztecNodeUrl}`);
  const aztecNode = createAztecNodeClient(aztecNodeUrl);
  logger.verbose(`Creating PXE client to remote host ${PXE_URL}`);
  const pxeClient = createPXEClient(PXE_URL, {}, makeFetch([1, 2, 3], true));
  await waitForPXE(pxeClient, logger);
  logger.verbose('JSON RPC client connected to PXE');
  logger.verbose(`Retrieving contract addresses from ${PXE_URL}`);
  const l1Contracts = (await pxeClient.getNodeInfo()).l1ContractAddresses;

  const walletClient = createWalletClient<HttpTransport, Chain, HDAccount>({
    account,
    chain: foundry,
    transport: http(config.l1RpcUrl),
  });
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(config.l1RpcUrl),
  });
  const deployL1ContractsValues: DeployL1Contracts = {
    l1ContractAddresses: l1Contracts,
    walletClient,
    publicClient,
  };
  const cheatCodes = await CheatCodes.create(config.l1RpcUrl, pxeClient!);
  const teardown = () => Promise.resolve();

  await setupCanonicalFeeJuice(pxeClient);

  logger.verbose('Constructing available wallets from already registered accounts...');
  const initialFundedAccounts = await getDeployedTestAccounts(pxeClient);
  const wallets = await getDeployedTestAccountsWallets(pxeClient);

  if (wallets.length < numberOfAccounts) {
    throw new Error(`Required ${numberOfAccounts} accounts. Found ${wallets.length}.`);
    // Deploy new accounts if there's a test that requires more funded accounts in the remote environment.
  }

  return {
    aztecNode,
    sequencer: undefined,
    proverNode: undefined,
    pxe: pxeClient,
    deployL1ContractsValues,
    accounts: await pxeClient!.getRegisteredAccounts(),
    config,
    initialFundedAccounts,
    wallet: wallets[0],
    wallets: wallets.slice(0, numberOfAccounts),
    logger,
    cheatCodes,
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
  deployL1ContractsValues?: DeployL1Contracts;
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
  initialValidators?: EthAddress[];
  /** Anvil Start time */
  l1StartTime?: number;
  /** The anvil time where we should at the earliest be seeing L2 blocks */
  l2StartTime?: number;
  /** How far we should assume proven */
  assumeProvenThrough?: number;
  /** Whether to start a prover node */
  startProverNode?: boolean;
  /** Whether to fund the rewardDistributor */
  fundRewardDistributor?: boolean;
  /** Manual config for the telemetry client */
  telemetryConfig?: Partial<TelemetryClientConfig> & { benchmark?: boolean };
  /** Public data that will be inserted in the tree in genesis */
  genesisPublicData?: PublicDataTreeLeaf[];
} & Partial<AztecNodeConfig>;

/** Context for an end-to-end test as returned by the `setup` function */
export type EndToEndContext = {
  /** The Aztec Node service or client a connected to it. */
  aztecNode: AztecNode;
  /** The prover node service (only set if startProverNode is true) */
  proverNode: ProverNode | undefined;
  /** A client to the sequencer service (undefined if connected to remote environment) */
  sequencer: SequencerClient | undefined;
  /** The Private eXecution Environment (PXE). */
  pxe: PXE;
  /** Return values from deployL1Contracts function. */
  deployL1ContractsValues: DeployL1Contracts;
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
    assumeProvenThrough: Number.MAX_SAFE_INTEGER,
    customForwarderContractAddress: EthAddress.ZERO,
  },
  pxeOpts: Partial<PXEServiceConfig> = {},
  chain: Chain = foundry,
): Promise<EndToEndContext> {
  const config = { ...getConfigEnvVars(), ...opts };
  config.peerCheckIntervalMS = TEST_PEER_CHECK_INTERVAL_MS;

  const logger = getLogger();

  // Create a temp directory for any services that need it and cleanup later
  const directoryToCleanup = path.join(tmpdir(), randomBytes(8).toString('hex'));
  await fs.mkdir(directoryToCleanup, { recursive: true });
  if (!config.dataDirectory) {
    config.dataDirectory = directoryToCleanup;
  }

  let anvil: Anvil | undefined;

  if (!config.l1RpcUrl) {
    if (!isAnvilTestChain(chain.id)) {
      throw new Error(`No ETHEREUM_HOST set but non anvil chain requested`);
    }
    if (PXE_URL) {
      throw new Error(
        `PXE_URL provided but no ETHEREUM_HOST set. Refusing to run, please set both variables so tests can deploy L1 contracts to the same Anvil instance`,
      );
    }

    const res = await startAnvil({ l1BlockTime: opts.ethereumSlotDuration });
    anvil = res.anvil;
    config.l1RpcUrl = res.rpcUrl;
  }

  // Enable logging metrics to a local file named after the test suite
  if (isMetricsLoggingRequested()) {
    const filename = path.join('log', getJobName() + '.jsonl');
    logger.info(`Logging metrics to ${filename}`);
    setupMetricsLogger(filename);
  }

  const ethCheatCodes = new EthCheatCodesWithState(config.l1RpcUrl);

  if (opts.stateLoad) {
    await ethCheatCodes.loadChainState(opts.stateLoad);
  }

  if (opts.l1StartTime) {
    await ethCheatCodes.warp(opts.l1StartTime);
  }

  let publisherPrivKey = undefined;
  let publisherHdAccount = undefined;

  if (config.publisherPrivateKey && config.publisherPrivateKey != NULL_KEY) {
    publisherHdAccount = privateKeyToAccount(config.publisherPrivateKey);
  } else if (!MNEMONIC) {
    throw new Error(`Mnemonic not provided and no publisher private key`);
  } else {
    publisherHdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const publisherPrivKeyRaw = publisherHdAccount.getHdKey().privateKey;
    publisherPrivKey = publisherPrivKeyRaw === null ? null : Buffer.from(publisherPrivKeyRaw);
    config.publisherPrivateKey = `0x${publisherPrivKey!.toString('hex')}`;
  }

  // Made as separate values such that keys can change, but for test they will be the same.
  config.validatorPrivateKey = config.publisherPrivateKey;

  if (PXE_URL) {
    // we are setting up against a remote environment, l1 contracts are assumed to already be deployed
    return await setupWithRemoteEnvironment(publisherHdAccount!, config, logger, numberOfAccounts);
  }

  // Blob sink service - blobs get posted here and served from here
  const blobSinkPort = await getPort();
  const blobSink = await createBlobSinkServer({ port: blobSinkPort });
  await blobSink.start();
  config.blobSinkUrl = `http://localhost:${blobSinkPort}`;

  const initialFundedAccounts =
    opts.initialFundedAccounts ??
    (await generateSchnorrAccounts(opts.numberOfInitialFundedAccounts ?? numberOfAccounts));
  const { genesisBlockHash, genesisArchiveRoot, prefilledPublicData } = await getGenesisValues(
    initialFundedAccounts.map(a => a.address),
    opts.initialAccountFeeJuice,
    opts.genesisPublicData,
  );

  const deployL1ContractsValues =
    opts.deployL1ContractsValues ??
    (await setupL1Contracts(
      config.l1RpcUrl,
      publisherHdAccount!,
      logger,
      { ...opts, genesisArchiveRoot, genesisBlockHash },
      chain,
    ));

  config.l1Contracts = deployL1ContractsValues.l1ContractAddresses;

  if (opts.fundRewardDistributor) {
    // Mints block rewards for 10000 blocks to the rewardDistributor contract

    const rewardDistributor = getContract({
      address: deployL1ContractsValues.l1ContractAddresses.rewardDistributorAddress.toString(),
      abi: l1Artifacts.rewardDistributor.contractAbi,
      client: deployL1ContractsValues.publicClient,
    });

    const blockReward = await rewardDistributor.read.BLOCK_REWARD();
    const mintAmount = 10_000n * (blockReward as bigint);

    const feeJuice = getContract({
      address: deployL1ContractsValues.l1ContractAddresses.feeJuiceAddress.toString(),
      abi: l1Artifacts.feeAsset.contractAbi,
      client: deployL1ContractsValues.walletClient,
    });

    const rewardDistributorMintTxHash = await feeJuice.write.mint([rewardDistributor.address, mintAmount], {} as any);
    await deployL1ContractsValues.publicClient.waitForTransactionReceipt({ hash: rewardDistributorMintTxHash });
    logger.info(`Funding rewardDistributor in ${rewardDistributorMintTxHash}`);
  }

  if (opts.l2StartTime) {
    // This should only be used in synching test or when you need to have a stable
    // timestamp for the first l2 block.
    await ethCheatCodes.warp(opts.l2StartTime);
  }

  const dateProvider = new TestDateProvider();

  const watcher = new AnvilTestWatcher(
    new EthCheatCodesWithState(config.l1RpcUrl),
    deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    deployL1ContractsValues.publicClient,
    dateProvider,
  );

  await watcher.start();

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

  const telemetry = getTelemetryClient(opts.telemetryConfig);

  const blobSinkClient = createBlobSinkClient(config);
  const aztecNode = await AztecNodeService.createAndSync(
    config,
    {
      dateProvider,
      blobSinkClient,
    },
    { prefilledPublicData },
  );
  const sequencer = aztecNode.getSequencer();

  if (sequencer) {
    const publisher = (sequencer as TestSequencerClient).sequencer.publisher;
    publisher.l1TxUtils = DelayedTxUtils.fromL1TxUtils(publisher.l1TxUtils, config.ethereumSlotDuration);
  }

  let proverNode: ProverNode | undefined = undefined;
  if (opts.startProverNode) {
    logger.verbose('Creating and syncing a simulated prover node...');
    const proverNodePrivateKey = getPrivateKeyFromIndex(2);
    const proverNodePrivateKeyHex: Hex = `0x${proverNodePrivateKey!.toString('hex')}`;
    proverNode = await createAndSyncProverNode(
      proverNodePrivateKeyHex,
      config,
      aztecNode,
      path.join(directoryToCleanup, randomBytes(8).toString('hex')),
    );
  }

  logger.verbose('Creating a pxe...');
  const { pxe, teardown: pxeTeardown } = await setupPXEService(aztecNode!, pxeOpts, logger);

  if (!config.skipProtocolContracts) {
    logger.verbose('Setting up Fee Juice...');
    await setupCanonicalFeeJuice(pxe);
  }

  const accountManagers = await deployFundedSchnorrAccounts(pxe, initialFundedAccounts.slice(0, numberOfAccounts));
  const wallets = await Promise.all(accountManagers.map(account => account.getWallet()));
  if (initialFundedAccounts.length < numberOfAccounts) {
    // TODO: Create (numberOfAccounts - initialFundedAccounts.length) wallets without funds.
    throw new Error(
      `Unable to deploy ${numberOfAccounts} accounts. Only ${initialFundedAccounts.length} accounts were funded.`,
    );
  }

  const cheatCodes = await CheatCodes.create(config.l1RpcUrl, pxe!);

  const teardown = async () => {
    await pxeTeardown();

    if (aztecNode instanceof AztecNodeService) {
      await aztecNode?.stop();
    }

    if (proverNode) {
      await proverNode.stop();
    }

    if (acvmConfig?.cleanup) {
      // remove the temp directory created for the acvm
      logger.verbose(`Cleaning up ACVM state`);
      await acvmConfig.cleanup();
    }

    if (bbConfig?.cleanup) {
      // remove the temp directory created for the acvm
      logger.verbose(`Cleaning up BB state`);
      await bbConfig.cleanup();
    }

    await anvil?.stop().catch(err => getLogger().error(err));
    await watcher.stop();
    await blobSink?.stop();

    if (directoryToCleanup) {
      logger.verbose(`Cleaning up data directory at ${directoryToCleanup}`);
      await fs.rm(directoryToCleanup, { recursive: true, force: true });
    }
  };

  return {
    aztecNode,
    proverNode,
    pxe,
    deployL1ContractsValues,
    config,
    initialFundedAccounts,
    wallet: wallets[0],
    wallets,
    logger,
    cheatCodes,
    sequencer,
    watcher,
    dateProvider,
    blobSink,
    telemetryClient: telemetry,
    teardown,
  };
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
  const requests = await Promise.all(
    instances.map(async instance => (await deployInstance(sender, instance!)).request()),
  );
  const batch = new BatchCall(sender, [...requests]);
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
 * Deploy the protocol contracts to a running instance.
 */
export async function setupCanonicalFeeJuice(pxe: PXE) {
  // "deploy" the Fee Juice as it contains public functions
  const feeJuicePortalAddress = (await pxe.getNodeInfo()).l1ContractAddresses.feeJuicePortalAddress;
  const wallet = new SignerlessWallet(pxe);
  const feeJuice = await FeeJuiceContract.at(ProtocolContractAddress.FeeJuice, wallet);

  try {
    const paymentMethod = new FeeJuicePaymentMethod(ProtocolContractAddress.FeeJuice);
    await feeJuice.methods
      .initialize(feeJuicePortalAddress, FEE_JUICE_INITIAL_MINT)
      .send({ fee: { paymentMethod, gasSettings: { teardownGasLimits: Gas.empty() } } })
      .wait();
    getLogger().info(`Fee Juice successfully setup. Portal address: ${feeJuicePortalAddress}`);
  } catch (error) {
    getLogger().warn(`Fee Juice might have already been setup. Got error: ${inspect(error)}.`);
  }
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

export async function createAndSyncProverNode(
  proverNodePrivateKey: `0x${string}`,
  aztecNodeConfig: AztecNodeConfig,
  aztecNode: AztecNode,
  dataDirectory: string,
  prefilledPublicData: PublicDataTreeLeaf[] = [],
) {
  // Disable stopping the aztec node as the prover coordination test will kill it otherwise
  // This is only required when stopping the prover node for testing
  const aztecNodeWithoutStop = {
    getTxByHash: aztecNode.getTxByHash.bind(aztecNode),
    getTxsByHash: aztecNode.getTxsByHash.bind(aztecNode),
    stop: () => Promise.resolve(),
  };

  const blobSinkClient = createBlobSinkClient(aztecNodeConfig);
  // Creating temp store and archiver for simulated prover node
  const archiverConfig = { ...aztecNodeConfig, dataDirectory };
  const archiver = await createArchiver(archiverConfig, blobSinkClient, {
    blockUntilSync: true,
  });

  // Prover node config is for simulated proofs
  const proverConfig: ProverNodeConfig = {
    ...aztecNodeConfig,
    proverCoordinationNodeUrl: undefined,
    dataDirectory: undefined,
    proverId: new Fr(42),
    realProofs: false,
    proverAgentCount: 2,
    publisherPrivateKey: proverNodePrivateKey,
    proverNodeMaxPendingJobs: 10,
    proverNodeMaxParallelBlocksPerEpoch: 32,
    proverNodePollingIntervalMs: 200,
    txGatheringTimeoutMs: 60000,
    txGatheringIntervalMs: 1000,
    txGatheringMaxParallelRequests: 100,
  };

  const l1TxUtils = createDelayedL1TxUtils(aztecNodeConfig, proverNodePrivateKey, 'prover-node');

  const proverNode = await createProverNode(
    proverConfig,
    {
      aztecNodeTxProvider: aztecNodeWithoutStop,
      archiver: archiver as Archiver,
      l1TxUtils,
    },
    { prefilledPublicData },
  );
  proverNode.start();
  return proverNode;
}

function createDelayedL1TxUtils(aztecNodeConfig: AztecNodeConfig, privateKey: `0x${string}`, logName: string) {
  const { publicClient, walletClient } = createL1Clients(aztecNodeConfig.l1RpcUrl, privateKey, foundry);

  const log = createLogger(logName);
  const l1TxUtils = new DelayedTxUtils(publicClient, walletClient, log, aztecNodeConfig);
  l1TxUtils.enableDelayer(aztecNodeConfig.ethereumSlotDuration);
  return l1TxUtils;
}

export async function createForwarderContract(
  aztecNodeConfig: AztecNodeConfig,
  privateKey: `0x${string}`,
  rollupAddress: Hex,
) {
  const { walletClient, publicClient } = createL1Clients(aztecNodeConfig.l1RpcUrl, privateKey, foundry);
  const forwarderContract = await ForwarderContract.create(
    walletClient.account.address,
    walletClient,
    publicClient,
    createLogger('forwarder'),
    rollupAddress,
  );
  return forwarderContract;
}
