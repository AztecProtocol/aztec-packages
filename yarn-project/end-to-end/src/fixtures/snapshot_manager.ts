import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';
import { type InitialAccountData, deployFundedSchnorrAccounts, generateSchnorrAccounts } from '@aztec/accounts/testing';
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import {
  type AztecAddress,
  type AztecNode,
  BatchCall,
  type CompleteAddress,
  type ContractFunctionInteraction,
  DefaultWaitForProvenOpts,
  type Logger,
  type PXE,
  type Wallet,
  getContractClassFromArtifact,
  waitForProven,
} from '@aztec/aztec.js';
import { deployInstance, registerContractClass } from '@aztec/aztec.js/deployment';
import { AnvilTestWatcher, CheatCodes } from '@aztec/aztec.js/testing';
import { type BlobSinkServer, createBlobSinkServer } from '@aztec/blob-sink/server';
import {
  type DeployL1ContractsArgs,
  type DeployL1ContractsReturnType,
  createExtendedL1Client,
  getL1ContractsConfigEnvVars,
  l1Artifacts,
} from '@aztec/ethereum';
import { EthCheatCodesWithState, startAnvil } from '@aztec/ethereum/test';
import { asyncMap } from '@aztec/foundation/async-map';
import { randomBytes } from '@aztec/foundation/crypto';
import { tryRmDir } from '@aztec/foundation/fs';
import { createLogger } from '@aztec/foundation/log';
import { resolver, reviver } from '@aztec/foundation/serialize';
import { TestDateProvider } from '@aztec/foundation/timer';
import type { ProverNode } from '@aztec/prover-node';
import { type PXEService, createPXEService, getPXEServiceConfig } from '@aztec/pxe/server';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { getConfigEnvVars as getTelemetryConfig, initTelemetryClient } from '@aztec/telemetry-client';
import { getGenesisValues } from '@aztec/world-state/testing';

import type { Anvil } from '@viem/anvil';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { copySync, removeSync } from 'fs-extra/esm';
import fs from 'fs/promises';
import getPort from 'get-port';
import { tmpdir } from 'os';
import path, { join } from 'path';
import { type Hex, getContract } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC, TEST_PEER_CHECK_INTERVAL_MS } from './fixtures.js';
import { getACVMConfig } from './get_acvm_config.js';
import { getBBConfig } from './get_bb_config.js';
import { setupL1Contracts } from './setup_l1_contracts.js';
import {
  type SetupOptions,
  createAndSyncProverNode,
  getLogger,
  getPrivateKeyFromIndex,
  getSponsoredFPCAddress,
} from './utils.js';
import { getEndToEndTestTelemetryClient } from './with_telemetry_utils.js';

export type SubsystemsContext = {
  anvil: Anvil;
  acvmConfig: any;
  bbConfig: any;
  aztecNode: AztecNodeService;
  aztecNodeConfig: AztecNodeConfig;
  pxe: PXEService;
  deployL1ContractsValues: DeployL1ContractsReturnType;
  proverNode?: ProverNode;
  watcher: AnvilTestWatcher;
  cheatCodes: CheatCodes;
  dateProvider: TestDateProvider;
  blobSink: BlobSinkServer;
  initialFundedAccounts: InitialAccountData[];
  directoryToCleanup?: string;
};

type SnapshotEntry = {
  name: string;
  apply: (context: SubsystemsContext) => Promise<any>;
  restore: (snapshotData: any, context: SubsystemsContext) => Promise<any>;
  snapshotPath: string;
};

export function createSnapshotManager(
  testName: string,
  dataPath?: string,
  config: Partial<SetupOptions> = {},
  deployL1ContractsArgs: Partial<DeployL1ContractsArgs> = {
    initialValidators: [],
  },
) {
  return dataPath
    ? new SnapshotManager(testName, dataPath, config, deployL1ContractsArgs)
    : new MockSnapshotManager(testName, config, deployL1ContractsArgs);
}

export interface ISnapshotManager {
  snapshot<T>(
    name: string,
    apply: (context: SubsystemsContext) => Promise<T>,
    restore?: (snapshotData: T, context: SubsystemsContext) => Promise<void>,
  ): Promise<void>;

  setup(): Promise<SubsystemsContext>;

  teardown(): Promise<void>;
}

/** Snapshot manager that does not perform snapshotting, it just applies transition and restoration functions as it receives them. */
class MockSnapshotManager implements ISnapshotManager {
  private context?: SubsystemsContext;
  private logger: Logger;

  constructor(
    testName: string,
    private config: Partial<AztecNodeConfig> = {},
    private deployL1ContractsArgs: Partial<DeployL1ContractsArgs> = {},
  ) {
    this.logger = createLogger(`e2e:snapshot_manager:${testName}`);
    this.logger.warn(`No data path given, will not persist any snapshots.`);
  }

  public async snapshot<T>(
    name: string,
    apply: (context: SubsystemsContext) => Promise<T>,
    restore: (snapshotData: T, context: SubsystemsContext) => Promise<void> = () => Promise.resolve(),
  ) {
    // We are running in disabled mode. Just apply the state.
    const context = await this.setup();
    this.logger.verbose(`Applying state transition for ${name}...`);
    const snapshotData = await apply(context);
    this.logger.verbose(`State transition for ${name} complete.`);
    // Execute the restoration function.
    await restore(snapshotData, context);
    return;
  }

  public async setup() {
    if (!this.context) {
      this.context = await setupFromFresh(undefined, this.logger, this.config, this.deployL1ContractsArgs);
    }
    return this.context;
  }

  public async teardown() {
    await teardown(this.context);
    this.context = undefined;
  }
}

/**
 * Snapshot engine for local e2e tests. Read more:
 * https://github.com/AztecProtocol/aztec-packages/pull/5526
 */
class SnapshotManager implements ISnapshotManager {
  private snapshotStack: SnapshotEntry[] = [];
  private context?: SubsystemsContext;
  private livePath: string;
  private logger: Logger;

  constructor(
    testName: string,
    private dataPath: string,
    private config: Partial<SetupOptions> = {},
    private deployL1ContractsArgs: Partial<DeployL1ContractsArgs> = {},
  ) {
    this.livePath = join(this.dataPath, 'live', testName);
    this.logger = createLogger(`e2e:snapshot_manager:${testName}`);
  }

  public async snapshot<T>(
    name: string,
    apply: (context: SubsystemsContext) => Promise<T>,
    restore: (snapshotData: T, context: SubsystemsContext) => Promise<void> = () => Promise.resolve(),
  ) {
    const snapshotPath = join(this.dataPath, 'snapshots', ...this.snapshotStack.map(e => e.name), name, 'snapshot');

    if (existsSync(snapshotPath)) {
      // Snapshot exists. Record entry on stack but do nothing else as we're probably still descending the tree.
      // It's the tests responsibility to call setup() before a test to ensure subsystems get created.
      this.logger.verbose(`Snapshot exists at ${snapshotPath}. Continuing...`);
      this.snapshotStack.push({ name, apply, restore, snapshotPath });
      return;
    }

    // Snapshot didn't exist at snapshotPath, and by definition none of the child snapshots can exist.
    // If we have no subsystem context yet, create it from the top of the snapshot stack (if it exists).
    const context = await this.setup();

    this.snapshotStack.push({ name, apply, restore, snapshotPath });

    // Apply current state transition.
    this.logger.verbose(`Applying state transition for ${name}...`);
    const snapshotData = await apply(context);
    this.logger.verbose(`State transition for ${name} complete.`);

    // Execute the restoration function.
    await restore(snapshotData, context);

    // Save the snapshot data.
    const ethCheatCodes = new EthCheatCodesWithState(context.aztecNodeConfig.l1RpcUrls);
    const anvilStateFile = `${this.livePath}/anvil.dat`;
    await ethCheatCodes.dumpChainState(anvilStateFile);
    writeFileSync(`${this.livePath}/${name}.json`, JSON.stringify(snapshotData || {}, resolver));

    // Copy everything to snapshot path.
    // We want it to be atomic, in case multiple processes are racing to create the snapshot.
    this.logger.verbose(`Saving snapshot to ${snapshotPath}...`);
    if (mkdirSync(snapshotPath, { recursive: true })) {
      copySync(this.livePath, snapshotPath);
      this.logger.verbose(`Snapshot copied to ${snapshotPath}.`);
    } else {
      this.logger.verbose(`Snapshot already exists at ${snapshotPath}. Discarding our version.`);
      await this.teardown();
    }
  }

  /**
   * Creates and returns the subsystem context based on the current snapshot stack.
   * If the subsystem context already exists, just return it.
   * If you want to be sure to get a clean snapshot, be sure to call teardown() before calling setup().
   */
  public async setup() {
    // We have no subsystem context yet.
    // If one exists on the snapshot stack, create one from that snapshot.
    // Otherwise create a fresh one.
    if (!this.context) {
      removeSync(this.livePath);
      mkdirSync(this.livePath, { recursive: true });
      const previousSnapshotPath = this.snapshotStack[this.snapshotStack.length - 1]?.snapshotPath;
      if (previousSnapshotPath) {
        this.logger.verbose(`Copying snapshot from ${previousSnapshotPath} to ${this.livePath}...`);
        copySync(previousSnapshotPath, this.livePath);
        this.context = await setupFromState(this.livePath, this.logger);
        // Execute each of the previous snapshots restoration functions in turn.
        await asyncMap(this.snapshotStack, async e => {
          const snapshotData = JSON.parse(readFileSync(`${e.snapshotPath}/${e.name}.json`, 'utf-8'), reviver);
          this.logger.verbose(`Executing restoration function for ${e.name}...`);
          await e.restore(snapshotData, this.context!);
          this.logger.verbose(`Restoration of ${e.name} complete.`);
        });
      } else {
        this.context = await setupFromFresh(this.livePath, this.logger, this.config, this.deployL1ContractsArgs);
      }
    }
    return this.context;
  }

  /**
   * Destroys the current subsystem context.
   */
  public async teardown() {
    await teardown(this.context);
    this.context = undefined;
    removeSync(this.livePath);
  }
}

/**
 * Destroys the current subsystem context.
 */
async function teardown(context: SubsystemsContext | undefined) {
  if (!context) {
    return;
  }
  const logger = getLogger();
  try {
    logger.info('Tearing down subsystems');
    await tryStop(context.proverNode);
    await tryStop(context.aztecNode);
    await context.acvmConfig?.cleanup();
    await context.bbConfig?.cleanup();
    await tryStop(context.anvil);
    await tryStop(context.watcher);
    await tryStop(context.blobSink);
    await tryRmDir(context.directoryToCleanup, logger);
  } catch (err) {
    logger.error('Error during teardown', err);
  }
}

/**
 * Initializes a fresh set of subsystems.
 * If given a statePath, the state will be written to the path.
 * If there is no statePath, in-memory and temporary state locations will be used.
 */
async function setupFromFresh(
  statePath: string | undefined,
  logger: Logger,
  { numberOfInitialFundedAccounts = 10, ...opts }: SetupOptions = {},
  deployL1ContractsArgs: Partial<DeployL1ContractsArgs> = {
    initialValidators: [],
  },
): Promise<SubsystemsContext> {
  logger.verbose(`Initializing state...`);

  const blobSinkPort = await getPort();

  // Fetch the AztecNode config.
  // TODO: For some reason this is currently the union of a bunch of subsystems. That needs fixing.
  const aztecNodeConfig: AztecNodeConfig & SetupOptions = { ...getConfigEnvVars(), ...opts };
  aztecNodeConfig.peerCheckIntervalMS = TEST_PEER_CHECK_INTERVAL_MS;
  // Only enable proving if specifically requested.
  aztecNodeConfig.realProofs = !!opts.realProofs;
  // Only enforce the time table if requested
  aztecNodeConfig.enforceTimeTable = !!opts.enforceTimeTable;
  // Only set the target committee size if it is explicitly set
  aztecNodeConfig.aztecTargetCommitteeSize = opts.aztecTargetCommitteeSize ?? 0;
  aztecNodeConfig.listenAddress = '127.0.0.1';

  deployL1ContractsArgs.aztecTargetCommitteeSize ??= aztecNodeConfig.aztecTargetCommitteeSize;

  // Create a temp directory for all ephemeral state and cleanup afterwards
  const directoryToCleanup = path.join(tmpdir(), randomBytes(8).toString('hex'));
  await fs.mkdir(directoryToCleanup, { recursive: true });
  if (statePath === undefined) {
    aztecNodeConfig.dataDirectory = directoryToCleanup;
  } else {
    aztecNodeConfig.dataDirectory = statePath;
  }
  aztecNodeConfig.blobSinkUrl = `http://127.0.0.1:${blobSinkPort}`;

  // Start anvil. We go via a wrapper script to ensure if the parent dies, anvil dies.
  logger.verbose('Starting anvil...');
  const res = await startAnvil({ l1BlockTime: opts.ethereumSlotDuration });
  const anvil = res.anvil;
  aztecNodeConfig.l1RpcUrls = [res.rpcUrl];

  // Deploy our L1 contracts.
  logger.verbose('Deploying L1 contracts...');
  const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
  const publisherPrivKeyRaw = hdAccount.getHdKey().privateKey;
  const publisherPrivKey = publisherPrivKeyRaw === null ? null : Buffer.from(publisherPrivKeyRaw);

  const validatorPrivKey = getPrivateKeyFromIndex(0);
  const proverNodePrivateKey = getPrivateKeyFromIndex(0);

  aztecNodeConfig.publisherPrivateKey = `0x${publisherPrivKey!.toString('hex')}`;
  aztecNodeConfig.validatorPrivateKeys = [`0x${validatorPrivKey!.toString('hex')}`];

  const ethCheatCodes = new EthCheatCodesWithState(aztecNodeConfig.l1RpcUrls);

  if (opts.l1StartTime) {
    await ethCheatCodes.warp(opts.l1StartTime);
  }

  const initialFundedAccounts = await generateSchnorrAccounts(numberOfInitialFundedAccounts);
  const sponsoredFPCAddress = await getSponsoredFPCAddress();
  const { genesisArchiveRoot, prefilledPublicData, fundingNeeded } = await getGenesisValues(
    initialFundedAccounts.map(a => a.address).concat(sponsoredFPCAddress),
    opts.initialAccountFeeJuice,
  );

  const deployL1ContractsValues = await setupL1Contracts(aztecNodeConfig.l1RpcUrls[0], hdAccount, logger, {
    ...getL1ContractsConfigEnvVars(),
    genesisArchiveRoot,
    feeJuicePortalInitialBalance: fundingNeeded,
    salt: opts.salt,
    ...deployL1ContractsArgs,
    initialValidators: opts.initialValidators,
  });
  aztecNodeConfig.l1Contracts = deployL1ContractsValues.l1ContractAddresses;
  aztecNodeConfig.rollupVersion = deployL1ContractsValues.rollupVersion;
  aztecNodeConfig.l1PublishRetryIntervalMS = 100;

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

  const dateProvider = new TestDateProvider();

  const watcher = new AnvilTestWatcher(
    new EthCheatCodesWithState(aztecNodeConfig.l1RpcUrls),
    deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    deployL1ContractsValues.l1Client,
    dateProvider,
  );
  await watcher.start();

  const acvmConfig = await getACVMConfig(logger);
  if (acvmConfig) {
    aztecNodeConfig.acvmWorkingDirectory = acvmConfig.acvmWorkingDirectory;
    aztecNodeConfig.acvmBinaryPath = acvmConfig.acvmBinaryPath;
  }

  const bbConfig = await getBBConfig(logger);
  if (bbConfig) {
    aztecNodeConfig.bbBinaryPath = bbConfig.bbBinaryPath;
    aztecNodeConfig.bbWorkingDirectory = bbConfig.bbWorkingDirectory;
  }

  const telemetry = getEndToEndTestTelemetryClient(opts.metricsPort);

  // Setup blob sink service
  const blobSink = await createBlobSinkServer(
    {
      l1ChainId: aztecNodeConfig.l1ChainId,
      l1RpcUrls: aztecNodeConfig.l1RpcUrls,
      l1Contracts: aztecNodeConfig.l1Contracts,
      port: blobSinkPort,
      dataDirectory: aztecNodeConfig.dataDirectory,
      dataStoreMapSizeKB: aztecNodeConfig.dataStoreMapSizeKB,
    },
    telemetry,
  );
  await blobSink.start();

  logger.verbose('Creating and synching an aztec node...');
  const aztecNode = await AztecNodeService.createAndSync(
    aztecNodeConfig,
    { telemetry, dateProvider },
    { prefilledPublicData },
  );

  let proverNode: ProverNode | undefined = undefined;
  if (opts.startProverNode) {
    logger.verbose('Creating and syncing a simulated prover node...');
    proverNode = await createAndSyncProverNode(
      `0x${proverNodePrivateKey!.toString('hex')}`,
      aztecNodeConfig,
      { dataDirectory: path.join(directoryToCleanup, randomBytes(8).toString('hex')) },
      aztecNode,
      prefilledPublicData,
    );
  }

  logger.verbose('Creating pxe...');
  const pxeConfig = getPXEServiceConfig();
  pxeConfig.dataDirectory = statePath ?? path.join(directoryToCleanup, randomBytes(8).toString('hex'));
  // Only enable proving if specifically requested.
  pxeConfig.proverEnabled = !!opts.realProofs;
  const pxe = await createPXEService(aztecNode, pxeConfig);

  const cheatCodes = await CheatCodes.create(aztecNodeConfig.l1RpcUrls, pxe);

  if (statePath) {
    writeFileSync(`${statePath}/aztec_node_config.json`, JSON.stringify(aztecNodeConfig, resolver));
    writeFileSync(`${statePath}/accounts.json`, JSON.stringify(initialFundedAccounts, resolver));
  }

  return {
    aztecNodeConfig,
    anvil,
    aztecNode,
    pxe,
    acvmConfig,
    bbConfig,
    deployL1ContractsValues,
    proverNode,
    watcher,
    cheatCodes,
    dateProvider,
    blobSink,
    initialFundedAccounts,
    directoryToCleanup,
  };
}

/**
 * Given a statePath, setup the system starting from that state.
 */
async function setupFromState(statePath: string, logger: Logger): Promise<SubsystemsContext> {
  logger.verbose(`Initializing with saved state at ${statePath}...`);

  const directoryToCleanup = path.join(tmpdir(), randomBytes(8).toString('hex'));
  await fs.mkdir(directoryToCleanup, { recursive: true });

  // Run the blob sink on a random port
  const blobSinkPort = await getPort();

  // TODO: For some reason this is currently the union of a bunch of subsystems. That needs fixing.
  const aztecNodeConfig: AztecNodeConfig & SetupOptions = JSON.parse(
    readFileSync(`${statePath}/aztec_node_config.json`, 'utf-8'),
    reviver,
  );
  aztecNodeConfig.dataDirectory = statePath;
  aztecNodeConfig.blobSinkUrl = `http://127.0.0.1:${blobSinkPort}`;
  aztecNodeConfig.listenAddress = '127.0.0.1';

  const initialFundedAccounts: InitialAccountData[] =
    JSON.parse(readFileSync(`${statePath}/accounts.json`, 'utf-8'), reviver) || [];
  const { prefilledPublicData } = await getGenesisValues(initialFundedAccounts.map(a => a.address));

  // Start anvil. We go via a wrapper script to ensure if the parent dies, anvil dies.
  const { anvil, rpcUrl } = await startAnvil();
  aztecNodeConfig.l1RpcUrls = [rpcUrl];
  // Load anvil state.
  const anvilStateFile = `${statePath}/anvil.dat`;
  const ethCheatCodes = new EthCheatCodesWithState(aztecNodeConfig.l1RpcUrls);
  await ethCheatCodes.loadChainState(anvilStateFile);

  // TODO: Encapsulate this in a NativeAcvm impl.
  const acvmConfig = await getACVMConfig(logger);
  if (acvmConfig) {
    aztecNodeConfig.acvmWorkingDirectory = acvmConfig.acvmWorkingDirectory;
    aztecNodeConfig.acvmBinaryPath = acvmConfig.acvmBinaryPath;
  }

  const bbConfig = await getBBConfig(logger);
  if (bbConfig) {
    aztecNodeConfig.bbBinaryPath = bbConfig.bbBinaryPath;
    aztecNodeConfig.bbWorkingDirectory = bbConfig.bbWorkingDirectory;
  }

  logger.verbose('Creating ETH clients...');
  const l1Client = createExtendedL1Client(aztecNodeConfig.l1RpcUrls, mnemonicToAccount(MNEMONIC));

  const dateProvider = new TestDateProvider();
  const watcher = new AnvilTestWatcher(
    new EthCheatCodesWithState(aztecNodeConfig.l1RpcUrls),
    aztecNodeConfig.l1Contracts.rollupAddress,
    l1Client,
    dateProvider,
  );
  await watcher.start();

  const telemetry = initTelemetryClient(getTelemetryConfig());
  const blobSink = await createBlobSinkServer(
    {
      l1ChainId: aztecNodeConfig.l1ChainId,
      l1RpcUrls: aztecNodeConfig.l1RpcUrls,
      l1Contracts: aztecNodeConfig.l1Contracts,
      port: blobSinkPort,
      dataDirectory: statePath,
      dataStoreMapSizeKB: aztecNodeConfig.dataStoreMapSizeKB,
    },
    telemetry,
  );
  await blobSink.start();

  logger.verbose('Creating aztec node...');
  const aztecNode = await AztecNodeService.createAndSync(
    aztecNodeConfig,
    { telemetry, dateProvider },
    { prefilledPublicData },
  );

  let proverNode: ProverNode | undefined = undefined;
  if (aztecNodeConfig.startProverNode) {
    logger.verbose('Creating and syncing a simulated prover node...');
    const proverNodePrivateKey = getPrivateKeyFromIndex(2);
    const proverNodePrivateKeyHex: Hex = `0x${proverNodePrivateKey!.toString('hex')}`;
    proverNode = await createAndSyncProverNode(
      proverNodePrivateKeyHex,
      aztecNodeConfig,
      { dataDirectory: path.join(directoryToCleanup, randomBytes(8).toString('hex')) },
      aztecNode,
      prefilledPublicData,
    );
  }

  logger.verbose('Creating pxe...');
  const pxeConfig = getPXEServiceConfig();
  pxeConfig.dataDirectory = statePath;
  const pxe = await createPXEService(aztecNode, pxeConfig);

  const cheatCodes = await CheatCodes.create(aztecNodeConfig.l1RpcUrls, pxe);

  return {
    aztecNodeConfig,
    anvil,
    aztecNode,
    pxe,
    acvmConfig,
    bbConfig,
    proverNode,
    deployL1ContractsValues: {
      l1Client,
      l1ContractAddresses: aztecNodeConfig.l1Contracts,
      rollupVersion: aztecNodeConfig.rollupVersion,
    },
    watcher,
    cheatCodes,
    dateProvider,
    blobSink,
    initialFundedAccounts,
    directoryToCleanup,
  };
}

/**
 * Snapshot 'apply' helper function to add accounts.
 * The 'restore' function is not provided, as it must be a closure within the test context to capture the results.
 */
export const deployAccounts =
  (numberOfAccounts: number, logger: Logger, waitUntilProven = false) =>
  async ({ pxe, initialFundedAccounts }: { pxe: PXE; initialFundedAccounts: InitialAccountData[] }) => {
    if (initialFundedAccounts.length < numberOfAccounts) {
      throw new Error(`Cannot deploy more than ${initialFundedAccounts.length} initial accounts.`);
    }

    logger.verbose('Deploying accounts funded with fee juice...');
    const deployedAccounts = initialFundedAccounts.slice(0, numberOfAccounts);
    await deployFundedSchnorrAccounts(
      pxe,
      deployedAccounts,
      undefined,
      waitUntilProven ? DefaultWaitForProvenOpts : undefined,
    );

    return { deployedAccounts };
  };

/**
 * Registers the contract class used for test accounts and publicly deploys the instances requested.
 * Use this when you need to make a public call to an account contract, such as for requesting a public authwit.
 * @param sender - Wallet to send the deployment tx.
 * @param accountsToDeploy - Which accounts to publicly deploy.
 * @param waitUntilProven - Whether to wait for the tx to be proven.
 * @param pxeOrNode - PXE or AztecNode to wait for proven.
 */
export async function publicDeployAccounts(
  sender: Wallet,
  accountsToDeploy: (CompleteAddress | AztecAddress)[],
  waitUntilProven = false,
  pxeOrNode?: PXE | AztecNode,
) {
  const accountAddressesToDeploy = accountsToDeploy.map(a => ('address' in a ? a.address : a));
  const instances = (
    await Promise.all(accountAddressesToDeploy.map(account => sender.getContractMetadata(account)))
  ).map(metadata => metadata.contractInstance);

  const contractClass = await getContractClassFromArtifact(SchnorrAccountContractArtifact);
  const alreadyRegistered = (await sender.getContractClassMetadata(contractClass.id)).isContractClassPubliclyRegistered;

  const calls: ContractFunctionInteraction[] = await Promise.all([
    ...(!alreadyRegistered ? [registerContractClass(sender, SchnorrAccountContractArtifact)] : []),
    ...instances.map(instance => deployInstance(sender, instance!)),
  ]);

  const batch = new BatchCall(sender, calls);

  const txReceipt = await batch.send().wait();
  if (waitUntilProven) {
    if (!pxeOrNode) {
      throw new Error('Need to provide a PXE or AztecNode to wait for proven.');
    } else {
      await waitForProven(pxeOrNode, txReceipt);
    }
  }
}
