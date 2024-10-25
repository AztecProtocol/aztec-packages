import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';
import { createAccounts, getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import {
  type AccountWalletWithSecretKey,
  AnvilTestWatcher,
  type AztecAddress,
  type AztecNode,
  BatchCall,
  CheatCodes,
  type ContractMethod,
  type DebugLogger,
  type DeployL1Contracts,
  EncryptedNoteL2BlockL2Logs,
  EthCheatCodes,
  LogType,
  NoFeePaymentMethod,
  type PXE,
  type SentTx,
  SignerlessWallet,
  type Wallet,
  createAztecNodeClient,
  createDebugLogger,
  createPXEClient,
  deployL1Contracts,
  makeFetch,
  waitForPXE,
} from '@aztec/aztec.js';
import { deployInstance, registerContractClass } from '@aztec/aztec.js/deployment';
import { DefaultMultiCallEntrypoint } from '@aztec/aztec.js/entrypoint';
import { type BBNativePrivateKernelProver } from '@aztec/bb-prover';
import { type EthAddress, GasSettings, getContractClassFromArtifact } from '@aztec/circuits.js';
import { NULL_KEY, isAnvilTestChain, l1Artifacts } from '@aztec/ethereum';
import { makeBackoff, retry, retryUntil } from '@aztec/foundation/retry';
import { FeeJuiceContract } from '@aztec/noir-contracts.js/FeeJuice';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { ProtocolContractAddress, protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { PXEService, type PXEServiceConfig, createPXEService, getPXEServiceConfig } from '@aztec/pxe';
import { type SequencerClient } from '@aztec/sequencer-client';
import { createAndStartTelemetryClient, getConfigEnvVars as getTelemetryConfig } from '@aztec/telemetry-client/start';

import { type Anvil, createAnvil } from '@viem/anvil';
import getPort from 'get-port';
import * as path from 'path';
import {
  type Account,
  type Chain,
  type HDAccount,
  type HttpTransport,
  type PrivateKeyAccount,
  createPublicClient,
  createWalletClient,
  getContract,
  http,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { MNEMONIC } from './fixtures.js';
import { getACVMConfig } from './get_acvm_config.js';
import { getBBConfig } from './get_bb_config.js';
import { isMetricsLoggingRequested, setupMetricsLogger } from './logging.js';

export { deployAndInitializeTokenAndBridgeContracts } from '../shared/cross_chain_test_harness.js';

const { PXE_URL = '' } = process.env;

const telemetryPromise = createAndStartTelemetryClient(getTelemetryConfig());
if (typeof afterAll === 'function') {
  afterAll(async () => {
    const client = await telemetryPromise;
    await client.stop();
  });
}

const getAztecUrl = () => {
  return PXE_URL;
};

export const getPrivateKeyFromIndex = (index: number): Buffer | null => {
  const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: index });
  const privKeyRaw = hdAccount.getHdKey().privateKey;
  return privKeyRaw === null ? null : Buffer.from(privKeyRaw);
};

export const setupL1Contracts = async (
  l1RpcUrl: string,
  account: HDAccount | PrivateKeyAccount,
  logger: DebugLogger,
  args: {
    salt?: number;
    initialValidators?: EthAddress[];
    assumeProvenThrough?: number;
  } = {
    assumeProvenThrough: Number.MAX_SAFE_INTEGER,
  },
  chain: Chain = foundry,
) => {
  const l1Data = await deployL1Contracts(l1RpcUrl, account, chain, logger, {
    l2FeeJuiceAddress: ProtocolContractAddress.FeeJuice,
    vkTreeRoot: getVKTreeRoot(),
    protocolContractTreeRoot,
    salt: args.salt,
    initialValidators: args.initialValidators,
    assumeProvenThrough: args.assumeProvenThrough,
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
  logger: DebugLogger;
  /**
   * Teardown function
   */
  teardown: () => Promise<void>;
}> {
  const pxeServiceConfig = { ...getPXEServiceConfig(), ...opts };
  const pxe = await createPXEService(aztecNode, pxeServiceConfig, useLogSuffix, proofCreator);

  const teardown = async () => {
    await pxe.stop();
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
  logger: DebugLogger,
  numberOfAccounts: number,
) {
  // we are setting up against a remote environment, l1 contracts are already deployed
  const aztecNodeUrl = getAztecUrl();
  logger.verbose(`Creating Aztec Node client to remote host ${aztecNodeUrl}`);
  const aztecNode = createAztecNodeClient(aztecNodeUrl);
  logger.verbose(`Creating PXE client to remote host ${PXE_URL}`);
  const pxeClient = createPXEClient(PXE_URL, makeFetch([1, 2, 3], true));
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

  const { l1ChainId: chainId, protocolVersion } = await pxeClient.getNodeInfo();
  await setupCanonicalFeeJuice(
    new SignerlessWallet(pxeClient, new DefaultMultiCallEntrypoint(chainId, protocolVersion)),
  );

  logger.verbose('Constructing available wallets from already registered accounts...');
  const wallets = await getDeployedTestAccountsWallets(pxeClient);

  if (wallets.length < numberOfAccounts) {
    const numNewAccounts = numberOfAccounts - wallets.length;
    logger.verbose(`Deploying ${numNewAccounts} accounts...`);
    wallets.push(...(await createAccounts(pxeClient, numNewAccounts)));
  }

  return {
    aztecNode,
    sequencer: undefined,
    prover: undefined,
    pxe: pxeClient,
    deployL1ContractsValues,
    accounts: await pxeClient!.getRegisteredAccounts(),
    config,
    wallet: wallets[0],
    wallets,
    logger,
    cheatCodes,
    watcher: undefined,
    teardown,
  };
}

/** Options for the e2e tests setup */
export type SetupOptions = {
  /** State load */
  stateLoad?: string;
  /** Previously deployed contracts on L1 */
  deployL1ContractsValues?: DeployL1Contracts;
  /** Whether to skip deployment of protocol contracts (auth registry, etc) */
  skipProtocolContracts?: boolean;
  /** Salt to use in L1 contract deployment */
  salt?: number;
  /** An initial set of validators */
  initialValidators?: EthAddress[];
  /** Anvil block time (interval) */
  l1BlockTime?: number;
  /** Anvil Start time */
  l1StartTime?: number;
  /** The anvil time where we should at the earliest be seeing L2 blocks */
  l2StartTime?: number;
  /** How far we should assume proven */
  assumeProvenThrough?: number;
  /** Whether to start a prover node */
  startProverNode?: boolean;
  /** Whether to fund the sysstia */
  fundSysstia?: boolean;
} & Partial<AztecNodeConfig>;

/** Context for an end-to-end test as returned by the `setup` function */
export type EndToEndContext = {
  /** The Aztec Node service or client a connected to it. */
  aztecNode: AztecNode;
  /** A client to the sequencer service (undefined if connected to remote environment) */
  sequencer: SequencerClient | undefined;
  /** The Private eXecution Environment (PXE). */
  pxe: PXE;
  /** Return values from deployL1Contracts function. */
  deployL1ContractsValues: DeployL1Contracts;
  /** The Aztec Node configuration. */
  config: AztecNodeConfig;
  /** The first wallet to be used. */
  wallet: AccountWalletWithSecretKey;
  /** The wallets to be used. */
  wallets: AccountWalletWithSecretKey[];
  /** Logger instance named as the current test. */
  logger: DebugLogger;
  /** The cheat codes. */
  cheatCodes: CheatCodes;
  /** The anvil test watcher (undefined if connected to remove environment) */
  watcher: AnvilTestWatcher | undefined;
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
  },
  pxeOpts: Partial<PXEServiceConfig> = {},
  chain: Chain = foundry,
): Promise<EndToEndContext> {
  const config = { ...getConfigEnvVars(), ...opts };
  const logger = getLogger();

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

    const res = await startAnvil(opts.l1BlockTime);
    anvil = res.anvil;
    config.l1RpcUrl = res.rpcUrl;
  }

  // Enable logging metrics to a local file named after the test suite
  if (isMetricsLoggingRequested()) {
    const filename = path.join('log', getJobName() + '.jsonl');
    logger.info(`Logging metrics to ${filename}`);
    setupMetricsLogger(filename);
  }

  const ethCheatCodes = new EthCheatCodes(config.l1RpcUrl);

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

  const deployL1ContractsValues =
    opts.deployL1ContractsValues ??
    (await setupL1Contracts(
      config.l1RpcUrl,
      publisherHdAccount!,
      logger,
      { salt: opts.salt, initialValidators: opts.initialValidators, assumeProvenThrough: opts.assumeProvenThrough },
      chain,
    ));

  config.l1Contracts = deployL1ContractsValues.l1ContractAddresses;

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

  if (opts.l2StartTime) {
    // This should only be used in synching test or when you need to have a stable
    // timestamp for the first l2 block.
    await ethCheatCodes.warp(opts.l2StartTime);
  }

  const watcher = new AnvilTestWatcher(
    new EthCheatCodes(config.l1RpcUrl),
    deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    deployL1ContractsValues.publicClient,
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

  const telemetry = await telemetryPromise;
  const aztecNode = await AztecNodeService.createAndSync(config, telemetry);
  const sequencer = aztecNode.getSequencer();

  logger.verbose('Creating a pxe...');

  const { pxe } = await setupPXEService(aztecNode!, pxeOpts, logger);

  if (!config.skipProtocolContracts) {
    logger.verbose('Setting up Fee Juice...');
    await setupCanonicalFeeJuice(
      new SignerlessWallet(pxe, new DefaultMultiCallEntrypoint(config.l1ChainId, config.version)),
    );
  }

  const wallets = numberOfAccounts > 0 ? await createAccounts(pxe, numberOfAccounts) : [];
  const cheatCodes = await CheatCodes.create(config.l1RpcUrl, pxe!);

  const teardown = async () => {
    if (aztecNode instanceof AztecNodeService) {
      await aztecNode?.stop();
    }
    if (pxe instanceof PXEService) {
      await pxe?.stop();
    }

    if (acvmConfig?.cleanup) {
      // remove the temp directory created for the acvm
      logger.verbose(`Cleaning up ACVM state`);
      await acvmConfig.cleanup();
    }

    await anvil?.stop();
    await watcher.stop();
  };

  return {
    aztecNode,
    pxe,
    deployL1ContractsValues,
    config,
    wallet: wallets[0],
    wallets,
    logger,
    cheatCodes,
    sequencer,
    watcher,
    teardown,
  };
}

/** Returns an L1 wallet client for anvil using a well-known private key based on the index. */
export function getL1WalletClient(rpcUrl: string, index: number) {
  const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: index });
  return createWalletClient({
    account: hdAccount,
    chain: foundry,
    transport: http(rpcUrl),
  });
}

/**
 * Ensures there's a running Anvil instance and returns the RPC URL.
 * @returns
 */
export async function startAnvil(l1BlockTime?: number): Promise<{ anvil: Anvil; rpcUrl: string }> {
  let rpcUrl: string | undefined = undefined;

  // Start anvil.
  // We go via a wrapper script to ensure if the parent dies, anvil dies.
  const anvil = await retry(
    async () => {
      const ethereumHostPort = await getPort();
      rpcUrl = `http://127.0.0.1:${ethereumHostPort}`;
      const anvil = createAnvil({
        anvilBinary: './scripts/anvil_kill_wrapper.sh',
        port: ethereumHostPort,
        blockTime: l1BlockTime,
      });
      await anvil.start();
      return anvil;
    },
    'Start anvil',
    makeBackoff([5, 5, 5]),
  );

  if (!rpcUrl) {
    throw new Error('Failed to start anvil');
  }

  return { anvil, rpcUrl };
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
        deployed: await sender.isContractPubliclyDeployed(address),
      };
    }),
  );
  const instances = await Promise.all(
    accountsAndAddresses.filter(({ deployed }) => !deployed).map(({ address }) => sender.getContractInstance(address)),
  );
  const contractClass = getContractClassFromArtifact(SchnorrAccountContractArtifact);
  if (!(await sender.isContractClassPubliclyRegistered(contractClass.id))) {
    await (await registerContractClass(sender, SchnorrAccountContractArtifact)).send().wait();
  }
  const batch = new BatchCall(sender, [...instances.map(instance => deployInstance(sender, instance!).request())]);
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
    return createDebugLogger('aztec:' + name);
  }
  return createDebugLogger('aztec:' + describeBlockName);
}

/**
 * Checks the number of encrypted logs in the last block is as expected.
 * @param aztecNode - The instance of aztec node for retrieving the logs.
 * @param numEncryptedLogs - The number of expected logs.
 */
export const expectsNumOfNoteEncryptedLogsInTheLastBlockToBe = async (
  aztecNode: AztecNode | undefined,
  numEncryptedLogs: number,
) => {
  if (!aztecNode) {
    // An api for retrieving encrypted logs does not exist on the PXE Service so we have to use the node
    // This means we can't perform this check if there is no node
    return;
  }
  const l2BlockNum = await aztecNode.getBlockNumber();
  const encryptedLogs = await aztecNode.getLogs(l2BlockNum, 1, LogType.NOTEENCRYPTED);
  const unrolledLogs = EncryptedNoteL2BlockL2Logs.unrollLogs(encryptedLogs);
  expect(unrolledLogs.length).toBe(numEncryptedLogs);
};

/**
 * Checks that the last block contains the given expected unencrypted log messages.
 * @param tx - An instance of SentTx for which to retrieve the logs.
 * @param logMessages - The set of expected log messages.
 */
export const expectUnencryptedLogsInTxToBe = async (tx: SentTx, logMessages: string[]) => {
  const unencryptedLogs = (await tx.getUnencryptedLogs()).logs;
  const asciiLogs = unencryptedLogs.map(extendedLog => extendedLog.log.data.toString('ascii'));

  expect(asciiLogs).toStrictEqual(logMessages);
};

/**
 * Checks that the last block contains the given expected unencrypted log messages.
 * @param pxe - An instance of PXE for retrieving the logs.
 * @param logMessages - The set of expected log messages.
 */
export const expectUnencryptedLogsFromLastBlockToBe = async (pxe: PXE, logMessages: string[]) => {
  // docs:start:get_logs
  // Get the unencrypted logs from the last block
  const fromBlock = await pxe.getBlockNumber();
  const logFilter = {
    fromBlock,
    toBlock: fromBlock + 1,
  };
  const unencryptedLogs = (await pxe.getUnencryptedLogs(logFilter)).logs;
  // docs:end:get_logs
  const asciiLogs = unencryptedLogs.map(extendedLog => extendedLog.log.data.toString('ascii'));

  expect(asciiLogs).toStrictEqual(logMessages);
};

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
    await feeJuice.methods
      .initialize(feeJuicePortalAddress)
      .send({ fee: { paymentMethod: new NoFeePaymentMethod(), gasSettings: GasSettings.teardownless() } })
      .wait();
    getLogger().info(`Fee Juice successfully setup. Portal address: ${feeJuicePortalAddress}`);
  } catch (error) {
    getLogger().info(`Fee Juice might have already been setup.`);
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
