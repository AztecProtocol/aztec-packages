import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';
import { type InitialAccountData, generateSchnorrAccounts } from '@aztec/accounts/testing';
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import {
  BatchCall,
  type ContractFunctionInteraction,
  type ContractMethod,
  type DeployInteractionWaitOptions,
  type DeployOptions,
  getContractClassFromArtifact,
  waitForProven,
} from '@aztec/aztec.js/contracts';
import { publishContractClass, publishInstance } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { AnvilTestWatcher, CheatCodes } from '@aztec/aztec/testing';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { isAnvilTestChain } from '@aztec/ethereum/chain';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { NULL_KEY } from '@aztec/ethereum/constants';
import { deployMulticall3 } from '@aztec/ethereum/contracts';
import {
  type DeployAztecL1ContractsArgs,
  type DeployAztecL1ContractsReturnType,
  type Operator,
  type ZKPassportArgs,
  deployAztecL1Contracts,
} from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import { type Anvil, EthCheatCodes, EthCheatCodesWithState, startAnvil } from '@aztec/ethereum/test';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { tryRmDir } from '@aztec/foundation/fs';
import { withLoggerBindings } from '@aztec/foundation/log/server';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, TestDateProvider } from '@aztec/foundation/timer';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import type { P2PClientDeps } from '@aztec/p2p';
import { MockGossipSubNetwork, getMockPubSubP2PServiceFactory } from '@aztec/p2p/test-helpers';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { ProverNodeConfig } from '@aztec/prover-node';
import { type PXEConfig, type PXECreationOptions, getPXEConfig } from '@aztec/pxe/server';
import type { SequencerClient } from '@aztec/sequencer-client';
import { ARTIFACT_VERSION_BEFORE_INJECTION } from '@aztec/stdlib/abi';
import { type ContractInstanceWithAddress, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import type { AztecNodeAdmin, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { DEV_VERSION } from '@aztec/stdlib/update-checker';
import {
  type TelemetryClient,
  type TelemetryClientConfig,
  getConfigEnvVars as getTelemetryConfig,
  initTelemetryClient,
} from '@aztec/telemetry-client';
import { BenchmarkTelemetryClient } from '@aztec/telemetry-client/bench';
import { deployFundedSchnorrAccounts } from '@aztec/wallets/testing';
import { getGenesisValues } from '@aztec/world-state/testing';

import fs from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { Hex } from 'viem';
import {
  type HDAccount,
  type PrivateKeyAccount,
  generatePrivateKey,
  mnemonicToAccount,
  privateKeyToAccount,
} from 'viem/accounts';
import { type Chain, foundry } from 'viem/chains';

import { TestWallet } from '../test-wallet/test_wallet.js';
import { MNEMONIC, TEST_MAX_PENDING_TX_POOL_COUNT, TEST_PEER_CHECK_INTERVAL_MS } from './fixtures.js';
import { getACVMConfig } from './get_acvm_config.js';
import { getBBConfig } from './get_bb_config.js';
import { isMetricsLoggingRequested, setupMetricsLogger } from './logging.js';
import { getEndToEndTestTelemetryClient } from './with_telemetry_utils.js';

export { startAnvil };

let telemetry: TelemetryClient | undefined = undefined;
async function getTelemetryClient(partialConfig: Partial<TelemetryClientConfig> & { benchmark?: boolean } = {}) {
  if (!telemetry) {
    const config = { ...getTelemetryConfig(), ...partialConfig };
    telemetry = config.benchmark ? new BenchmarkTelemetryClient() : await initTelemetryClient(config);
  }
  return telemetry;
}

export const getPrivateKeyFromIndex = (index: number): Buffer | null => {
  const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: index });
  const privKeyRaw = hdAccount.getHdKey().privateKey;
  return privKeyRaw === null ? null : Buffer.from(privKeyRaw);
};

/**
 * Sets up shared blob storage using FileStore in the data directory.
 */
export async function setupSharedBlobStorage(config: { dataDirectory?: string } & Record<string, any>): Promise<void> {
  const sharedBlobPath = path.join(config.dataDirectory!, 'shared-blobs');
  await fs.mkdir(sharedBlobPath, { recursive: true });
  config.blobFileStoreUrls = [`file://${sharedBlobPath}`];
  config.blobFileStoreUploadUrl = `file://${sharedBlobPath}`;
}

/**
 * Sets up Private eXecution Environment (PXE) and returns the corresponding test wallet.
 * @param aztecNode - An instance of Aztec Node.
 * @param opts - Partial configuration for the PXE.
 * @param logger - The logger to be used.
 * @param actor - Actor label to include in log output (e.g., 'pxe-test').
 * @returns A test wallet, logger and teardown function.
 */
export async function setupPXEAndGetWallet(
  aztecNode: AztecNode,
  opts: Partial<PXEConfig> = {},
  logger = getLogger(),
  actor?: string,
): Promise<{
  wallet: TestWallet;
  logger: Logger;
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

  const wallet = await TestWallet.create(aztecNode, PXEConfig, { loggerActorLabel: actor });

  return {
    wallet,
    logger,
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
  deployL1ContractsValues?: DeployAztecL1ContractsReturnType;
  /** Initial fee juice for default accounts */
  initialAccountFeeJuice?: Fr;
  /** Number of initial accounts funded with fee juice */
  numberOfInitialFundedAccounts?: number;
  /** Data of the initial funded accounts */
  initialFundedAccounts?: InitialAccountData[];
  /** An initial set of validators */
  initialValidators?: (Operator & { privateKey: `0x${string}` })[];
  /** Anvil Start time */
  l1StartTime?: number;
  /** The anvil time where we should at the earliest be seeing L2 blocks */
  l2StartTime?: number;
  /** Whether to start a prover node */
  startProverNode?: boolean;
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
  /**
   * Number of slots per epoch for Anvil's finality simulation.
   * Anvil reports `finalized = latest - slotsInAnEpoch * 2`.
   */
  anvilSlotsInAnEpoch?: number;
  /** Key to use for publishing L1 contracts */
  l1PublisherKey?: SecretValue<`0x${string}`>;
  /** ZkPassport configuration (domain, scope, mock verifier) */
  zkPassportArgs?: ZKPassportArgs;
  /** Whether to fund the sponsored FPC in genesis (defaults to false). */
  fundSponsoredFPC?: boolean;
  /** Whether to skip deploying accounts during setup (legacy behavior for tests using deployAccounts helper). */
  skipAccountDeployment?: boolean;
  /** L1 contracts deployment arguments. */
  l1ContractsArgs?: Partial<DeployAztecL1ContractsArgs>;
  /** Wallet minimum fee padding multiplier (defaults to 0.5, which is 50% padding). */
  walletMinFeePadding?: number;
  /** Options forwarded to PXE creation (e.g. execution hooks). */
  pxeCreationOptions?: PXECreationOptions;
} & Partial<AztecNodeConfig>;

/** Context for an end-to-end test as returned by the `setup` function */
export type EndToEndContext = {
  /** The Anvil instance (only set if anvil was started locally). */
  anvil: Anvil | undefined;
  /** The Aztec Node service or client a connected to it. */
  aztecNode: AztecNode & AztecNodeDebug;
  /** The Aztec Node as a service. */
  aztecNodeService: AztecNodeService;
  /** Client to the Aztec Node admin interface. */
  aztecNodeAdmin: AztecNodeAdmin;
  /** The aztec node running the prover node subsystem (only set if startProverNode is true). */
  proverNode: AztecNodeService | undefined;
  /** A client to the sequencer service. */
  sequencer: SequencerClient | undefined;
  /** Return values from deployAztecL1Contracts function. */
  deployL1ContractsValues: DeployAztecL1ContractsReturnType;
  /** The Aztec Node configuration. */
  config: AztecNodeConfig;
  /** The Aztec Node configuration (alias for config for backward compatibility). */
  aztecNodeConfig: AztecNodeConfig;
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
  /** The anvil test watcher. */
  watcher: AnvilTestWatcher;
  /** Allows tweaking current system time, used by the epoch cache only. */
  dateProvider: TestDateProvider;
  /** Telemetry client */
  telemetryClient: TelemetryClient;
  /** Mock gossip sub network used for gossipping messages (only if mockGossipSubNetwork was set to true in opts) */
  mockGossipSubNetwork: MockGossipSubNetwork | undefined;
  /** Delayer for sequencer L1 txs (only when enableDelayer is true). */
  sequencerDelayer: Delayer | undefined;
  /** Delayer for prover node L1 txs (only when enableDelayer and startProverNode are true). */
  proverDelayer: Delayer | undefined;
  /** Prefilled public data used for setting up nodes. */
  prefilledPublicData: PublicDataTreeLeaf[] | undefined;
  /** ACVM config (only set if running locally). */
  acvmConfig: Awaited<ReturnType<typeof getACVMConfig>>;
  /** BB config (only set if running locally). */
  bbConfig: Awaited<ReturnType<typeof getBBConfig>>;
  /** Directory to cleanup on teardown. */
  directoryToCleanup: string;
  /** Function to stop the started services. */
  teardown: () => Promise<void>;
};

/**
 * When CONTRACT_ARTIFACTS_VERSION is set (backwards compatibility testing), asserts that the loaded artifact's
 * aztecVersion matches the expected version. This is a sanity check verifying that the legacy artifact resolver
 * actually swapped in the correct version.
 */
function assertContractArtifactsVersion() {
  const expected = process.env.CONTRACT_ARTIFACTS_VERSION;
  if (!expected) {
    return;
  }
  const { aztecVersion } = SponsoredFPCContract.artifact;
  // TODO(F-557): Remove this bypass once pre-version artifacts are no longer tested.
  if (aztecVersion === ARTIFACT_VERSION_BEFORE_INJECTION) {
    createLogger('e2e:setup').info(
      `Skipping artifact version check: artifact predates version injection (CONTRACT_ARTIFACTS_VERSION=${expected})`,
    );
    return;
  }
  // TODO(F-557): Remove once v4.3.0 drops off the compat matrix. The v4.3.0 npm release shipped with
  // aztec_version: "dev" baked into the artifact JSONs because of a bug.
  if (expected === '4.3.0' && aztecVersion === DEV_VERSION) {
    createLogger('e2e:setup').warn(
      `Skipping artifact version check: v4.3.0 artifacts shipped with aztec_version="dev"`,
    );
    return;
  }
  if (aztecVersion !== expected) {
    throw new Error(
      `Artifact version mismatch: expected ${expected} but got ${aztecVersion}. ` +
        `The legacy artifact resolver may not have swapped in the correct version.`,
    );
  }
}

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
  assertContractArtifactsVersion();
  let anvil: Anvil | undefined;
  try {
    opts.aztecTargetCommitteeSize ??= 0;
    opts.slasherFlavor ??= 'none';

    const config: AztecNodeConfig & SetupOptions = { ...getConfigEnvVars(), ...opts };
    // use initialValidators for the node config
    config.validatorPrivateKeys = new SecretValue(opts.initialValidators?.map(v => v.privateKey) ?? []);

    config.peerCheckIntervalMS = TEST_PEER_CHECK_INTERVAL_MS;
    config.maxPendingTxCount = opts.maxPendingTxCount ?? TEST_MAX_PENDING_TX_POOL_COUNT;
    // For tests we only want proving enabled if specifically requested
    config.realProofs = !!opts.realProofs;
    // Only enforce the time table if requested
    config.enforceTimeTable = !!opts.enforceTimeTable;
    // Enable the tx delayer for tests (default config has it disabled, so we force-enable it here)
    config.enableDelayer = true;
    config.listenAddress = '127.0.0.1';

    config.minTxPoolAgeMs = opts.minTxPoolAgeMs ?? 0;

    const logger = getLogger();

    // Create a temp directory for any services that need it and cleanup later
    const directoryToCleanup = path.join(tmpdir(), randomBytes(8).toString('hex'));
    await fs.mkdir(directoryToCleanup, { recursive: true });
    if (!config.dataDirectory) {
      config.dataDirectory = directoryToCleanup;
    }

    const dateProvider = new TestDateProvider();

    if (!config.l1RpcUrls?.length) {
      if (!isAnvilTestChain(chain.id)) {
        throw new Error(`No ETHEREUM_HOSTS set but non anvil chain requested`);
      }
      const res = await startAnvil({
        l1BlockTime: opts.ethereumSlotDuration,
        accounts: opts.anvilAccounts,
        port: opts.anvilPort ?? (process.env.ANVIL_PORT ? parseInt(process.env.ANVIL_PORT) : undefined),
        slotsInAnEpoch: opts.anvilSlotsInAnEpoch,
        dateProvider,
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
    const ethCheatCodes = new EthCheatCodesWithState(config.l1RpcUrls, dateProvider);

    if (opts.stateLoad) {
      await ethCheatCodes.loadChainState(opts.stateLoad);
    }

    if (opts.l1StartTime) {
      await ethCheatCodes.warp(opts.l1StartTime, { resetBlockInterval: true });
    }

    let publisherPrivKeyHex: `0x${string}` | undefined = undefined;
    let publisherHdAccount: HDAccount | PrivateKeyAccount | undefined = undefined;

    if (opts.l1PublisherKey && opts.l1PublisherKey.getValue() && opts.l1PublisherKey.getValue() != NULL_KEY) {
      publisherPrivKeyHex = opts.l1PublisherKey.getValue();
      publisherHdAccount = privateKeyToAccount(publisherPrivKeyHex);
    } else if (
      config.sequencerPublisherPrivateKeys &&
      config.sequencerPublisherPrivateKeys.length > 0 &&
      config.sequencerPublisherPrivateKeys[0].getValue() != NULL_KEY
    ) {
      publisherPrivKeyHex = config.sequencerPublisherPrivateKeys[0].getValue();
      publisherHdAccount = privateKeyToAccount(publisherPrivKeyHex);
    } else if (!MNEMONIC) {
      throw new Error(`Mnemonic not provided and no publisher private key`);
    } else {
      publisherHdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
      const publisherPrivKeyRaw = publisherHdAccount.getHdKey().privateKey;
      const publisherPrivKey = publisherPrivKeyRaw === null ? null : Buffer.from(publisherPrivKeyRaw);
      publisherPrivKeyHex = `0x${publisherPrivKey!.toString('hex')}` as const;
      config.sequencerPublisherPrivateKeys = [new SecretValue(publisherPrivKeyHex)];
    }

    if (config.coinbase === undefined) {
      config.coinbase = EthAddress.fromString(publisherHdAccount.address);
    }

    // Determine which addresses to fund in genesis
    const initialFundedAccounts =
      opts.initialFundedAccounts ??
      (await generateSchnorrAccounts(opts.numberOfInitialFundedAccounts ?? Math.max(numberOfAccounts, 10)));
    const addressesToFund = initialFundedAccounts.map(a => a.address);

    // Optionally fund the sponsored FPC
    if (opts.fundSponsoredFPC) {
      const sponsoredFPCAddress = await getSponsoredFPCAddress();
      addressesToFund.push(sponsoredFPCAddress);
    }

    const { genesisArchiveRoot, prefilledPublicData, fundingNeeded } = await getGenesisValues(
      addressesToFund,
      opts.initialAccountFeeJuice,
      opts.genesisPublicData,
    );

    const wasAutomining = await ethCheatCodes.isAutoMining();
    const enableAutomine = opts.automineL1Setup && !wasAutomining && isAnvilTestChain(chain.id);
    if (enableAutomine) {
      await ethCheatCodes.setAutomine(true);
    }

    const l1Client = createExtendedL1Client(config.l1RpcUrls, publisherHdAccount!, chain);

    // Deploy Multicall3 if running locally
    await deployMulticall3(l1Client, logger);

    // Force viem to refresh its nonce cache to avoid "nonce too low" errors in subsequent transactions
    // This is necessary because deployMulticall3 sends multiple transactions and viem may cache a stale nonce
    await l1Client.getTransactionCount({ address: l1Client.account.address });

    const deployL1ContractsValues: DeployAztecL1ContractsReturnType = await deployAztecL1Contracts(
      config.l1RpcUrls[0],
      publisherPrivKeyHex!,
      chain.id,
      {
        ...getL1ContractsConfigEnvVars(),
        ...opts,
        ...opts.l1ContractsArgs,
        vkTreeRoot: getVKTreeRoot(),
        protocolContractsHash,
        genesisArchiveRoot,
        initialValidators: opts.initialValidators,
        feeJuicePortalInitialBalance: fundingNeeded,
        realVerifier: false,
      },
    );

    config.l1Contracts = deployL1ContractsValues.l1ContractAddresses;
    config.rollupVersion = deployL1ContractsValues.rollupVersion;

    if (enableAutomine) {
      await ethCheatCodes.setAutomine(false);
      await ethCheatCodes.setIntervalMining(config.ethereumSlotDuration);
    }

    // In compose mode (no local anvil), sync dateProvider to L1 time since it may have drifted
    // ahead of system time due to the local-network watcher warping time forward on each filled slot.
    // When running with a local anvil, the dateProvider is kept in sync via the stdout listener.
    if (!anvil) {
      dateProvider.setTime((await ethCheatCodes.lastBlockTimestamp()) * 1000);
    }

    if (opts.l2StartTime) {
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

    // Use metricsPort-based telemetry if provided, otherwise use the regular telemetry client
    const telemetryClient = opts.metricsPort
      ? await getEndToEndTestTelemetryClient(opts.metricsPort)
      : await getTelemetryClient(opts.telemetryConfig);

    await setupSharedBlobStorage(config);

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

    let mockGossipSubNetwork: MockGossipSubNetwork | undefined;
    let p2pClientDeps: P2PClientDeps | undefined = undefined;

    if (opts.mockGossipSubNetwork) {
      mockGossipSubNetwork = new MockGossipSubNetwork();
      p2pClientDeps = { p2pServiceFactory: getMockPubSubP2PServiceFactory(mockGossipSubNetwork) };
    }

    // Transactions built against the genesis state must be included in block 1, otherwise they are dropped.
    // To avoid test failures from dropped transactions, we ensure progression beyond genesis before proceeding.
    // For account deployments, we set minTxsPerBlock=1 and deploy accounts sequentially for guaranteed success.
    // If no accounts need deployment, we await an empty block to confirm network progression.
    const originalMinTxsPerBlock = config.minTxsPerBlock;
    if (originalMinTxsPerBlock === undefined) {
      throw new Error('minTxsPerBlock is undefined in e2e test setup');
    }

    // Only set minTxsPerBlock=1 if we're going to deploy accounts and need reliable block inclusion
    const shouldDeployAccounts = numberOfAccounts > 0 && !opts.skipAccountDeployment;
    // Only set minTxsPerBlock=0 if we need an empty block (no accounts at all, not skipped deployment)
    const needsEmptyBlock = numberOfAccounts === 0 && !opts.skipAccountDeployment;
    config.minTxsPerBlock = shouldDeployAccounts ? 1 : needsEmptyBlock ? 0 : originalMinTxsPerBlock;

    config.p2pEnabled = opts.mockGossipSubNetwork || config.p2pEnabled;
    config.p2pIp = opts.p2pIp ?? config.p2pIp ?? '127.0.0.1';

    if (!config.disableValidator) {
      if ((config.validatorPrivateKeys?.getValue().length ?? 0) === 0) {
        config.validatorPrivateKeys = new SecretValue([generatePrivateKey()]);
      }
    }

    const aztecNodeService = await withLoggerBindings({ actor: 'node-0' }, () =>
      AztecNodeService.createAndSync(
        config,
        { dateProvider, telemetry: telemetryClient, p2pClientDeps },
        { prefilledPublicData },
      ),
    );
    const sequencerClient = aztecNodeService.getSequencer();

    let proverNode: AztecNodeService | undefined = undefined;
    if (opts.startProverNode) {
      logger.verbose('Creating and syncing a simulated prover node...');
      const proverNodePrivateKey = getPrivateKeyFromIndex(2);
      const proverNodePrivateKeyHex: Hex = `0x${proverNodePrivateKey!.toString('hex')}`;
      const proverNodeDataDirectory = path.join(directoryToCleanup, randomBytes(8).toString('hex'));

      const p2pClientDeps: Partial<P2PClientDeps> = {
        p2pServiceFactory: mockGossipSubNetwork && getMockPubSubP2PServiceFactory(mockGossipSubNetwork!),
        rpcTxProviders: [aztecNodeService],
      };

      ({ proverNode } = await createAndSyncProverNode(
        proverNodePrivateKeyHex,
        config,
        {
          ...config.proverNodeConfig,
          dataDirectory: proverNodeDataDirectory,
        },
        { dateProvider, p2pClientDeps, telemetry: telemetryClient },
        { prefilledPublicData },
      ));
    }

    const sequencerDelayer = sequencerClient?.getDelayer();
    const proverDelayer = proverNode?.getProverNode()?.getDelayer();

    logger.verbose('Creating a pxe...');
    const pxeConfig = { ...getPXEConfig(), ...pxeOpts };
    pxeConfig.dataDirectory = path.join(directoryToCleanup, randomBytes(8).toString('hex'));
    // For tests we only want proving enabled if specifically requested
    pxeConfig.proverEnabled = !!pxeOpts.proverEnabled;
    const wallet = await TestWallet.create(aztecNodeService, pxeConfig, {
      loggerActorLabel: 'pxe-0',
      ...opts.pxeCreationOptions,
    });

    if (opts.walletMinFeePadding !== undefined) {
      wallet.setMinFeePadding(opts.walletMinFeePadding);
    }

    const cheatCodes = await CheatCodes.create(config.l1RpcUrls, aztecNodeService, dateProvider);

    if (
      (opts.aztecTargetCommitteeSize && opts.aztecTargetCommitteeSize > 0) ||
      (opts.initialValidators && opts.initialValidators.length > 0)
    ) {
      // We need to advance such that the committee is set up.
      await cheatCodes.rollup.advanceToEpoch(
        EpochNumber.fromBigInt(
          BigInt(await cheatCodes.rollup.getEpoch()) + BigInt(config.lagInEpochsForValidatorSet + 1),
        ),
      );
      await cheatCodes.rollup.setupEpoch();
      await cheatCodes.rollup.debugRollup();
    }

    let accounts: AztecAddress[] = [];

    if (shouldDeployAccounts) {
      logger.info(
        `${numberOfAccounts} accounts are being deployed. Reliably progressing past genesis by setting minTxsPerBlock to 1 and waiting for the accounts to be deployed`,
      );
      const accountsData = initialFundedAccounts.slice(0, numberOfAccounts);
      const accountManagers = await deployFundedSchnorrAccounts(wallet, accountsData);
      accounts = accountManagers.map(accountManager => accountManager.address);
    } else if (needsEmptyBlock) {
      logger.info('No accounts are being deployed, waiting for an empty block 1 to be mined');
      while ((await aztecNodeService.getBlockNumber()) === 0) {
        await sleep(2000);
      }
    }
    // If skipAccountDeployment is true, we don't deploy or wait - tests will handle account deployment later

    // Now we restore the original minTxsPerBlock setting if we changed it.
    if (sequencerClient && config.minTxsPerBlock !== originalMinTxsPerBlock) {
      sequencerClient.getSequencer().updateConfig({ minTxsPerBlock: originalMinTxsPerBlock });
    }

    if (initialFundedAccounts.length < numberOfAccounts) {
      throw new Error(
        `Unable to deploy ${numberOfAccounts} accounts. Only ${initialFundedAccounts.length} accounts were funded.`,
      );
    }

    const teardown = async () => {
      try {
        await tryStop(wallet, logger);
        await tryStop(aztecNodeService, logger);
        await tryStop(proverNode, logger);

        if (acvmConfig?.cleanup) {
          await acvmConfig.cleanup();
        }

        if (bbConfig?.cleanup) {
          await bbConfig.cleanup();
        }

        await tryStop(watcher, logger);
        await tryStop(anvil, logger);

        await tryRmDir(directoryToCleanup, logger);
      } catch (err) {
        logger.error(`Error during e2e test teardown`, err);
      } finally {
        try {
          await telemetryClient.stop();
        } catch (err) {
          logger.error(`Error during telemetry client stop`, err);
        }
      }
    };

    return {
      anvil,
      aztecNode: aztecNodeService,
      aztecNodeService,
      aztecNodeAdmin: aztecNodeService,
      cheatCodes,
      ethCheatCodes,
      config,
      aztecNodeConfig: config,
      dateProvider,
      deployL1ContractsValues,
      initialFundedAccounts,
      logger,
      mockGossipSubNetwork,
      prefilledPublicData,
      proverNode,
      sequencerDelayer,
      proverDelayer,
      sequencer: sequencerClient,
      teardown,
      telemetryClient,
      wallet,
      accounts,
      watcher,
      acvmConfig,
      bbConfig,
      directoryToCleanup,
    };
  } catch (err) {
    await anvil?.stop();
    throw err;
  }
}

/** Returns the job name for the current test. */
function getJobName() {
  return process.env.JOB_NAME ?? expect.getState().currentTestName?.split(' ')[0].replaceAll('/', '_') ?? 'unknown';
}

/**
 * Returns a logger instance for the current test.
 */
export function getLogger() {
  const describeBlockName = expect.getState().currentTestName?.split(' ')[0].replaceAll('/', ':');
  if (!describeBlockName) {
    const name = expect.getState().testPath?.split('/').pop()?.split('.')[0] ?? 'unknown';
    return createLogger('e2e:' + name);
  }
  return createLogger('e2e:' + describeBlockName);
}

/**
 * Computes the address of the "canonical" SponsoredFPCContract.
 */
export function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return Promise.resolve(
    getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
      salt: new Fr(SPONSORED_FPC_SALT),
    }),
  );
}

/**
 * Computes the address of the "canonical" SponsoredFPCContract.
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

  await wallet.registerContract(instance, SponsoredFPCContract.artifact);
  getLogger().info(`SponsoredFPC: ${instance.address}`);
  return instance;
}

/**
 * Registers the SponsoredFPC in this PXE instance.
 */
export async function registerSponsoredFPC(wallet: Wallet): Promise<void> {
  await wallet.registerContract(await getSponsoredFPCInstance(), SponsoredFPCContract.artifact);
}

export async function waitForProvenChain(node: AztecNode, targetBlock?: BlockNumber, timeoutSec = 60, intervalSec = 1) {
  targetBlock ??= await node.getBlockNumber();

  await retryUntil(
    async () => (await node.getProvenBlockNumber()) >= targetBlock,
    'proven chain status',
    timeoutSec,
    intervalSec,
  );
}

/**
 * Creates an AztecNodeService with the prover node enabled as a subsystem.
 * Returns both the aztec node service (for lifecycle management) and the prover node (for test internals access).
 */
export function createAndSyncProverNode(
  proverNodePrivateKey: `0x${string}`,
  baseConfig: AztecNodeConfig,
  configOverrides: Pick<AztecNodeConfig, 'dataDirectory'>,
  deps: {
    telemetry?: TelemetryClient;
    dateProvider: DateProvider;
    p2pClientDeps?: P2PClientDeps;
  },
  options: { prefilledPublicData: PublicDataTreeLeaf[]; dontStart?: boolean },
): Promise<{ proverNode: AztecNodeService }> {
  return withLoggerBindings({ actor: 'prover-0' }, async () => {
    const proverNode = await AztecNodeService.createAndSync(
      {
        ...baseConfig,
        ...configOverrides,
        p2pPort: 0,
        enableProverNode: true,
        disableValidator: true,
        proverPublisherPrivateKeys: [new SecretValue(proverNodePrivateKey)],
      },
      deps,
      { ...options, dontStartProverNode: options.dontStart },
    );

    if (!proverNode.getProverNode()) {
      throw new Error('Prover node subsystem was not created despite enableProverNode being set');
    }

    getLogger().info(`Created and synced prover node`);
    return { proverNode };
  });
}

export type BalancesFn = ReturnType<typeof getBalancesFn>;
export function getBalancesFn(
  symbol: string,
  method: ContractMethod,
  logger: any,
): (...addresses: (AztecAddress | { address: AztecAddress })[]) => Promise<bigint[]> {
  const balances = async (...addressLikes: (AztecAddress | { address: AztecAddress })[]) => {
    const addresses = addressLikes.map(addressLike => ('address' in addressLike ? addressLike.address : addressLike));
    const b = await Promise.all(
      addresses.map(async address => (await method(address).simulate({ from: address })).result),
    );
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
 * Registers the contract class used for test accounts and publicly deploys the instances requested.
 * Use this when you need to make a public call to an account contract, such as for requesting a public authwit.
 */
export async function ensureAccountContractsPublished(wallet: Wallet, accountsToDeploy: AztecAddress[]) {
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
  ).map(contractMetadata => contractMetadata.instance);
  const contractClass = await getContractClassFromArtifact(SchnorrAccountContractArtifact);
  if (!(await wallet.getContractClassMetadata(contractClass.id)).isContractClassPubliclyRegistered) {
    await (await publishContractClass(wallet, SchnorrAccountContractArtifact)).send({ from: accountsToDeploy[0] });
  }
  const requests = instances.map(instance => publishInstance(wallet, instance!));
  const batch = new BatchCall(wallet, requests);
  await batch.send({ from: accountsToDeploy[0] });
}

/**
 * Helper function to deploy accounts.
 * Returns deployed account data that can be used by tests.
 */
export const deployAccounts =
  (numberOfAccounts: number, logger: Logger, deployOptions?: Partial<DeployOptions<DeployInteractionWaitOptions>>) =>
  async ({ wallet, initialFundedAccounts }: { wallet: TestWallet; initialFundedAccounts: InitialAccountData[] }) => {
    if (initialFundedAccounts.length < numberOfAccounts) {
      throw new Error(`Cannot deploy more than ${initialFundedAccounts.length} initial accounts.`);
    }

    logger.verbose('Deploying accounts funded with fee juice...');
    const deployedAccounts = initialFundedAccounts.slice(0, numberOfAccounts);
    // Serial due to https://github.com/AztecProtocol/aztec-packages/issues/12045
    for (let i = 0; i < deployedAccounts.length; i++) {
      const accountManager = await wallet.createSchnorrAccount(
        deployedAccounts[i].secret,
        deployedAccounts[i].salt,
        deployedAccounts[i].signingKey,
      );
      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod.send({
        from: NO_FROM,
        skipClassPublication: i !== 0, // Publish the contract class at most once.
        ...deployOptions,
      });
    }

    return { deployedAccounts };
  };

/**
 * Registers the contract class used for test accounts and publicly deploys the instances requested.
 * Use this when you need to make a public call to an account contract, such as for requesting a public authwit.
 */
export async function publicDeployAccounts(
  wallet: Wallet,
  accountsToDeploy: AztecAddress[],
  waitUntilProven = false,
  node?: AztecNode,
) {
  const instances = (await Promise.all(accountsToDeploy.map(account => wallet.getContractMetadata(account)))).map(
    metadata => metadata.instance,
  );

  const contractClass = await getContractClassFromArtifact(SchnorrAccountContractArtifact);
  const alreadyRegistered = (await wallet.getContractClassMetadata(contractClass.id)).isContractClassPubliclyRegistered;

  const calls: ContractFunctionInteraction[] = await Promise.all([
    ...(!alreadyRegistered ? [publishContractClass(wallet, SchnorrAccountContractArtifact)] : []),
    ...instances.map(instance => publishInstance(wallet, instance!)),
  ]);

  const batch = new BatchCall(wallet, calls);

  const { receipt: txReceipt } = await batch.send({ from: accountsToDeploy[0] });
  if (waitUntilProven) {
    if (!node) {
      throw new Error('Need to provide an AztecNode to wait for proven.');
    } else {
      await waitForProven(node, txReceipt);
    }
  }
}

/**
 * Destroys the current context.
 */
export async function teardown(context: EndToEndContext | undefined) {
  if (!context) {
    return;
  }
  await context.teardown();
}

// Re-export for backward compatibility
export { deployAndInitializeTokenAndBridgeContracts } from '../shared/cross_chain_test_harness.js';
