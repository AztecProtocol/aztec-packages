import { SchnorrAccountContractArtifact, getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type Archiver, createArchiver } from '@aztec/archiver';
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import {
  AnvilTestWatcher,
  type AztecAddress,
  type AztecNode,
  BatchCall,
  CheatCodes,
  type CompleteAddress,
  type DebugLogger,
  type DeployL1Contracts,
  EthCheatCodes,
  Fr,
  GrumpkinScalar,
  type PXE,
  type Wallet,
} from '@aztec/aztec.js';
import { deployInstance, registerContractClass } from '@aztec/aztec.js/deployment';
import { type DeployL1ContractsArgs, createL1Clients, l1Artifacts } from '@aztec/ethereum';
import { asyncMap } from '@aztec/foundation/async-map';
import { type Logger, createDebugLogger } from '@aztec/foundation/log';
import { resolver, reviver } from '@aztec/foundation/serialize';
import { type ProverNode, type ProverNodeConfig, createProverNode } from '@aztec/prover-node';
import { type PXEService, createPXEService, getPXEServiceConfig } from '@aztec/pxe';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { createAndStartTelemetryClient, getConfigEnvVars as getTelemetryConfig } from '@aztec/telemetry-client/start';

import { type Anvil, createAnvil } from '@viem/anvil';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { copySync, removeSync } from 'fs-extra/esm';
import getPort from 'get-port';
import { join } from 'path';
import { type Hex, getContract } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC } from './fixtures.js';
import { getACVMConfig } from './get_acvm_config.js';
import { getBBConfig } from './get_bb_config.js';
import { setupL1Contracts } from './setup_l1_contracts.js';
import { type SetupOptions, getPrivateKeyFromIndex, startAnvil } from './utils.js';

export type SubsystemsContext = {
  anvil: Anvil;
  acvmConfig: any;
  bbConfig: any;
  aztecNode: AztecNodeService;
  aztecNodeConfig: AztecNodeConfig;
  pxe: PXEService;
  deployL1ContractsValues: DeployL1Contracts;
  proverNode?: ProverNode;
  watcher: AnvilTestWatcher;
  cheatCodes: CheatCodes;
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
    assumeProvenThrough: Number.MAX_SAFE_INTEGER,
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
  private logger: DebugLogger;

  constructor(
    testName: string,
    private config: Partial<AztecNodeConfig> = {},
    private deployL1ContractsArgs: Partial<DeployL1ContractsArgs> = { assumeProvenThrough: Number.MAX_SAFE_INTEGER },
  ) {
    this.logger = createDebugLogger(`aztec:snapshot_manager:${testName}`);
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
  private logger: DebugLogger;

  constructor(
    testName: string,
    private dataPath: string,
    private config: Partial<SetupOptions> = {},
    private deployL1ContractsArgs: Partial<DeployL1ContractsArgs> = { assumeProvenThrough: Number.MAX_SAFE_INTEGER },
  ) {
    this.livePath = join(this.dataPath, 'live', testName);
    this.logger = createDebugLogger(`aztec:snapshot_manager:${testName}`);
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
    const ethCheatCodes = new EthCheatCodes(context.aztecNodeConfig.l1RpcUrl);
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
  await context.proverNode?.stop();
  await context.aztecNode.stop();
  await context.pxe.stop();
  await context.acvmConfig?.cleanup();
  await context.anvil.stop();
  await context.watcher.stop();
}

async function createAndSyncProverNode(
  proverNodePrivateKey: `0x${string}`,
  aztecNodeConfig: AztecNodeConfig,
  aztecNode: AztecNode,
) {
  // Creating temp store and archiver for simulated prover node
  const archiverConfig = { ...aztecNodeConfig, dataDirectory: undefined };
  const archiver = await createArchiver(archiverConfig, new NoopTelemetryClient(), { blockUntilSync: true });

  // Prover node config is for simulated proofs
  const proverConfig: ProverNodeConfig = {
    ...aztecNodeConfig,
    proverCoordinationNodeUrl: undefined,
    dataDirectory: undefined,
    proverId: new Fr(42),
    realProofs: false,
    proverAgentConcurrency: 2,
    publisherPrivateKey: proverNodePrivateKey,
    proverNodeMaxPendingJobs: 10,
    proverNodePollingIntervalMs: 200,
    quoteProviderBasisPointFee: 100,
    quoteProviderBondAmount: 1000n,
    proverMinimumEscrowAmount: 1000n,
    proverTargetEscrowAmount: 2000n,
  };
  const proverNode = await createProverNode(proverConfig, {
    aztecNodeTxProvider: aztecNode,
    archiver: archiver as Archiver,
  });
  await proverNode.start();
  return proverNode;
}

/**
 * Initializes a fresh set of subsystems.
 * If given a statePath, the state will be written to the path.
 * If there is no statePath, in-memory and temporary state locations will be used.
 */
async function setupFromFresh(
  statePath: string | undefined,
  logger: Logger,
  opts: SetupOptions = {},
  deployL1ContractsArgs: Partial<DeployL1ContractsArgs> = {
    assumeProvenThrough: Number.MAX_SAFE_INTEGER,
  },
): Promise<SubsystemsContext> {
  logger.verbose(`Initializing state...`);

  // Fetch the AztecNode config.
  // TODO: For some reason this is currently the union of a bunch of subsystems. That needs fixing.
  const aztecNodeConfig: AztecNodeConfig & SetupOptions = { ...getConfigEnvVars(), ...opts };
  aztecNodeConfig.dataDirectory = statePath;

  // Start anvil. We go via a wrapper script to ensure if the parent dies, anvil dies.
  logger.verbose('Starting anvil...');
  const res = await startAnvil(opts.l1BlockTime);
  const anvil = res.anvil;
  aztecNodeConfig.l1RpcUrl = res.rpcUrl;

  // Deploy our L1 contracts.
  logger.verbose('Deploying L1 contracts...');
  const hdAccount = mnemonicToAccount(MNEMONIC, { accountIndex: 0 });
  const publisherPrivKeyRaw = hdAccount.getHdKey().privateKey;
  const publisherPrivKey = publisherPrivKeyRaw === null ? null : Buffer.from(publisherPrivKeyRaw);

  const validatorPrivKey = getPrivateKeyFromIndex(1);
  const proverNodePrivateKey = getPrivateKeyFromIndex(2);

  aztecNodeConfig.publisherPrivateKey = `0x${publisherPrivKey!.toString('hex')}`;
  aztecNodeConfig.validatorPrivateKey = `0x${validatorPrivKey!.toString('hex')}`;

  const ethCheatCodes = new EthCheatCodes(aztecNodeConfig.l1RpcUrl);

  if (opts.l1StartTime) {
    await ethCheatCodes.warp(opts.l1StartTime);
  }

  const deployL1ContractsValues = await setupL1Contracts(aztecNodeConfig.l1RpcUrl, hdAccount, logger, {
    salt: opts.salt,
    initialValidators: opts.initialValidators,
    ...deployL1ContractsArgs,
  });
  aztecNodeConfig.l1Contracts = deployL1ContractsValues.l1ContractAddresses;
  aztecNodeConfig.l1PublishRetryIntervalMS = 100;

  if (opts.fundSysstia) {
    // Mints block rewards for 10000 blocks to the sysstia contract

    const sysstia = getContract({
      address: deployL1ContractsValues.l1ContractAddresses.sysstiaAddress.toString(),
      abi: l1Artifacts.sysstia.contractAbi,
      client: deployL1ContractsValues.publicClient,
    });

    const blockReward = await sysstia.read.BLOCK_REWARD([]);
    const mintAmount = 10_000n * (blockReward as bigint);

    const feeJuice = getContract({
      address: deployL1ContractsValues.l1ContractAddresses.feeJuiceAddress.toString(),
      abi: l1Artifacts.feeJuice.contractAbi,
      client: deployL1ContractsValues.walletClient,
    });

    const sysstiaMintTxHash = await feeJuice.write.mint([sysstia.address, mintAmount], {} as any);
    await deployL1ContractsValues.publicClient.waitForTransactionReceipt({ hash: sysstiaMintTxHash });
    logger.info(`Funding sysstia in ${sysstiaMintTxHash}`);
  }

  const watcher = new AnvilTestWatcher(
    new EthCheatCodes(aztecNodeConfig.l1RpcUrl),
    deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    deployL1ContractsValues.publicClient,
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

  const telemetry = await createAndStartTelemetryClient(getTelemetryConfig());
  logger.verbose('Creating and synching an aztec node...');
  const aztecNode = await AztecNodeService.createAndSync(aztecNodeConfig, telemetry);

  let proverNode: ProverNode | undefined = undefined;
  if (opts.startProverNode) {
    logger.verbose('Creating and syncing a simulated prover node...');
    proverNode = await createAndSyncProverNode(
      `0x${proverNodePrivateKey!.toString('hex')}`,
      aztecNodeConfig,
      aztecNode,
    );
  }

  logger.verbose('Creating pxe...');
  const pxeConfig = getPXEServiceConfig();
  pxeConfig.dataDirectory = statePath;
  const pxe = await createPXEService(aztecNode, pxeConfig);

  const cheatCodes = await CheatCodes.create(aztecNodeConfig.l1RpcUrl, pxe);

  if (statePath) {
    writeFileSync(`${statePath}/aztec_node_config.json`, JSON.stringify(aztecNodeConfig));
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
  };
}

/**
 * Given a statePath, setup the system starting from that state.
 */
async function setupFromState(statePath: string, logger: Logger): Promise<SubsystemsContext> {
  logger.verbose(`Initializing with saved state at ${statePath}...`);

  // Load config.
  // TODO: For some reason this is currently the union of a bunch of subsystems. That needs fixing.
  const aztecNodeConfig: AztecNodeConfig & SetupOptions = JSON.parse(
    readFileSync(`${statePath}/aztec_node_config.json`, 'utf-8'),
    reviver,
  );
  aztecNodeConfig.dataDirectory = statePath;

  // Start anvil. We go via a wrapper script to ensure if the parent dies, anvil dies.
  const ethereumHostPort = await getPort();
  aztecNodeConfig.l1RpcUrl = `http://127.0.0.1:${ethereumHostPort}`;
  const anvil = createAnvil({ anvilBinary: './scripts/anvil_kill_wrapper.sh', port: ethereumHostPort });
  await anvil.start();
  // Load anvil state.
  const anvilStateFile = `${statePath}/anvil.dat`;
  const ethCheatCodes = new EthCheatCodes(aztecNodeConfig.l1RpcUrl);
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
  const { publicClient, walletClient } = createL1Clients(aztecNodeConfig.l1RpcUrl, mnemonicToAccount(MNEMONIC));

  const watcher = new AnvilTestWatcher(
    new EthCheatCodes(aztecNodeConfig.l1RpcUrl),
    aztecNodeConfig.l1Contracts.rollupAddress,
    publicClient,
  );
  await watcher.start();

  logger.verbose('Creating aztec node...');
  const telemetry = await createAndStartTelemetryClient(getTelemetryConfig());
  const aztecNode = await AztecNodeService.createAndSync(aztecNodeConfig, telemetry);

  let proverNode: ProverNode | undefined = undefined;
  if (aztecNodeConfig.startProverNode) {
    logger.verbose('Creating and syncing a simulated prover node...');
    const proverNodePrivateKey = getPrivateKeyFromIndex(2);
    const proverNodePrivateKeyHex: Hex = `0x${proverNodePrivateKey!.toString('hex')}`;
    proverNode = await createAndSyncProverNode(proverNodePrivateKeyHex, aztecNodeConfig, aztecNode);
  }

  logger.verbose('Creating pxe...');
  const pxeConfig = getPXEServiceConfig();
  pxeConfig.dataDirectory = statePath;
  const pxe = await createPXEService(aztecNode, pxeConfig);

  const cheatCodes = await CheatCodes.create(aztecNodeConfig.l1RpcUrl, pxe);

  return {
    aztecNodeConfig,
    anvil,
    aztecNode,
    pxe,
    acvmConfig,
    bbConfig,
    proverNode,
    deployL1ContractsValues: {
      walletClient,
      publicClient,
      l1ContractAddresses: aztecNodeConfig.l1Contracts,
    },
    watcher,
    cheatCodes,
  };
}

/**
 * Snapshot 'apply' helper function to add accounts.
 * The 'restore' function is not provided, as it must be a closure within the test context to capture the results.
 */
export const addAccounts =
  (numberOfAccounts: number, logger: DebugLogger, waitUntilProven = false) =>
  async ({ pxe }: { pxe: PXE }) => {
    // Generate account keys.
    const accountKeys: [Fr, GrumpkinScalar][] = Array.from({ length: numberOfAccounts }).map(_ => [
      Fr.random(),
      GrumpkinScalar.random(),
    ]);

    logger.verbose('Simulating account deployment...');
    const provenTxs = await Promise.all(
      accountKeys.map(async ([secretKey, signPk]) => {
        const account = getSchnorrAccount(pxe, secretKey, signPk, 1);
        const deployMethod = await account.getDeployMethod();

        const provenTx = await deployMethod.prove({
          contractAddressSalt: account.salt,
          skipClassRegistration: true,
          skipPublicDeployment: true,
          universalDeploy: true,
        });
        return provenTx;
      }),
    );

    logger.verbose('Deploying accounts...');
    const txs = await Promise.all(provenTxs.map(provenTx => provenTx.send()));
    await Promise.all(txs.map(tx => tx.wait({ interval: 0.1, proven: waitUntilProven })));

    return { accountKeys };
  };

/**
 * Registers the contract class used for test accounts and publicly deploys the instances requested.
 * Use this when you need to make a public call to an account contract, such as for requesting a public authwit.
 * @param sender - Wallet to send the deployment tx.
 * @param accountsToDeploy - Which accounts to publicly deploy.
 */
export async function publicDeployAccounts(
  sender: Wallet,
  accountsToDeploy: (CompleteAddress | AztecAddress)[],
  waitUntilProven = false,
) {
  const accountAddressesToDeploy = accountsToDeploy.map(a => ('address' in a ? a.address : a));
  const instances = await Promise.all(accountAddressesToDeploy.map(account => sender.getContractInstance(account)));
  const batch = new BatchCall(sender, [
    (await registerContractClass(sender, SchnorrAccountContractArtifact)).request(),
    ...instances.map(instance => deployInstance(sender, instance!).request()),
  ]);
  await batch.send().wait({ proven: waitUntilProven });
}
