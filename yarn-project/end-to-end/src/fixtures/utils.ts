import { AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import {
  AccountWalletWithPrivateKey,
  AztecAddress,
  CheatCodes,
  CompleteAddress,
  EthAddress,
  EthCheatCodes,
  SentTx,
  Wallet,
  createAccounts,
  createPXEClient,
  getSandboxAccountsWallets,
} from '@aztec/aztec.js';
import {
  DeployL1Contracts,
  L1ContractArtifactsForDeployment,
  deployL1Contract,
  deployL1Contracts,
} from '@aztec/ethereum';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import {
  ContractDeploymentEmitterAbi,
  ContractDeploymentEmitterBytecode,
  DecoderHelperAbi,
  DecoderHelperBytecode,
  InboxAbi,
  InboxBytecode,
  OutboxAbi,
  OutboxBytecode,
  PortalERC20Abi,
  PortalERC20Bytecode,
  RegistryAbi,
  RegistryBytecode,
  RollupAbi,
  RollupBytecode,
  TokenPortalAbi,
  TokenPortalBytecode,
} from '@aztec/l1-artifacts';
import { NonNativeTokenContract, TokenBridgeContract, TokenContract } from '@aztec/noir-contracts/types';
import { PXEService, createPXEService, getPXEServiceConfig } from '@aztec/pxe';
import { AztecNode, L2BlockL2Logs, LogType, PXE, TxStatus, createAztecNodeRpcClient } from '@aztec/types';

import * as path from 'path';
import {
  Account,
  Chain,
  HDAccount,
  HttpTransport,
  PrivateKeyAccount,
  PublicClient,
  WalletClient,
  createPublicClient,
  createWalletClient,
  getContract,
  http,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC, localAnvil } from './fixtures.js';
import { isMetricsLoggingRequested, setupMetricsLogger } from './logging.js';

const { PXE_URL = '', AZTEC_NODE_URL = '' } = process.env;

const getAztecNodeUrl = () => {
  if (AZTEC_NODE_URL) return AZTEC_NODE_URL;

  // If AZTEC_NODE_URL is not set, we assume that the PXE is running on the same host as the Aztec Node and use the default port
  const url = new URL(PXE_URL);
  url.port = '8079';
  return url.toString();
};

export const waitForPXE = async (pxe: PXE, logger: DebugLogger) => {
  await retryUntil(async () => {
    try {
      logger('Attempting to contact PXE...');
      await pxe.getNodeInfo();
      return true;
    } catch (error) {
      logger('Failed to contact PXE!');
    }
    return undefined;
  }, 'RPC Get Node Info');
};

export const setupL1Contracts = async (
  l1RpcUrl: string,
  account: HDAccount | PrivateKeyAccount,
  logger: DebugLogger,
  deployDecoderHelper = false,
) => {
  const l1Artifacts: L1ContractArtifactsForDeployment = {
    contractDeploymentEmitter: {
      contractAbi: ContractDeploymentEmitterAbi,
      contractBytecode: ContractDeploymentEmitterBytecode,
    },
    registry: {
      contractAbi: RegistryAbi,
      contractBytecode: RegistryBytecode,
    },
    inbox: {
      contractAbi: InboxAbi,
      contractBytecode: InboxBytecode,
    },
    outbox: {
      contractAbi: OutboxAbi,
      contractBytecode: OutboxBytecode,
    },
    rollup: {
      contractAbi: RollupAbi,
      contractBytecode: RollupBytecode,
    },
  };
  if (deployDecoderHelper) {
    l1Artifacts.decoderHelper = {
      contractAbi: DecoderHelperAbi,
      contractBytecode: DecoderHelperBytecode,
    };
  }
  return await deployL1Contracts(l1RpcUrl, account, localAnvil, logger, l1Artifacts);
};

/**
 * Sets up Private eXecution Environment (PXE).
 * @param numberOfAccounts - The number of new accounts to be created once the PXE is initiated.
 * @param aztecNode - An instance of Aztec Node.
 * @param firstPrivKey - The private key of the first account to be created.
 * @param logger - The logger to be used.
 * @param useLogSuffix - Whether to add a randomly generated suffix to the PXE debug logs.
 * @returns Private eXecution Environment (PXE), accounts, wallets and logger.
 */
export async function setupPXEService(
  numberOfAccounts: number,
  aztecNode: AztecNode,
  logger = getLogger(),
  useLogSuffix = false,
): Promise<{
  /**
   * The PXE instance.
   */
  pxe: PXE;
  /**
   * The accounts created by the PXE.
   */
  accounts: CompleteAddress[];
  /**
   * The wallets to be used.
   */
  wallets: AccountWalletWithPrivateKey[];
  /**
   * Logger instance named as the current test.
   */
  logger: DebugLogger;
}> {
  const pxeServiceConfig = getPXEServiceConfig();
  const pxe = await createPXEService(aztecNode, pxeServiceConfig, {}, useLogSuffix);

  const wallets = await createAccounts(pxe, numberOfAccounts);

  return {
    pxe,
    accounts: await pxe.getRegisteredAccounts(),
    wallets,
    logger,
  };
}

/**
 * Function to setup the test against a running sandbox.
 * @param account - The account for use in create viem wallets.
 * @param config - The aztec Node Configuration
 * @param logger - The logger to be used
 * @returns Private eXecution Environment (PXE) client, viem wallets, contract addresses etc.
 */
async function setupWithSandbox(account: Account, config: AztecNodeConfig, logger: DebugLogger) {
  // we are setting up against the sandbox, l1 contracts are already deployed
  const aztecNodeUrl = getAztecNodeUrl();
  logger(`Creating Aztec Node client to remote host ${aztecNodeUrl}`);
  const aztecNode = createAztecNodeRpcClient(aztecNodeUrl);
  logger(`Creating PXE client to remote host ${PXE_URL}`);
  const pxeClient = createPXEClient(PXE_URL);
  await waitForPXE(pxeClient, logger);
  logger('JSON RPC client connected to PXE');
  logger(`Retrieving contract addresses from ${PXE_URL}`);
  const l1Contracts = (await pxeClient.getNodeInfo()).l1ContractAddresses;
  logger('PXE created, constructing wallets from initial sandbox accounts...');
  const wallets = await getSandboxAccountsWallets(pxeClient);

  const walletClient = createWalletClient<HttpTransport, Chain, HDAccount>({
    account,
    chain: localAnvil,
    transport: http(config.rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: localAnvil,
    transport: http(config.rpcUrl),
  });
  const deployL1ContractsValues: DeployL1Contracts = {
    l1ContractAddresses: l1Contracts,
    walletClient,
    publicClient,
  };
  const cheatCodes = await CheatCodes.create(config.rpcUrl, pxeClient!);
  const teardown = () => Promise.resolve();
  return {
    aztecNode,
    pxe: pxeClient,
    deployL1ContractsValues,
    accounts: await pxeClient!.getRegisteredAccounts(),
    config,
    wallet: wallets[0],
    wallets,
    logger,
    cheatCodes,
    teardown,
  };
}

/** Options for the e2e tests setup */
type SetupOptions = { /** State load */ stateLoad?: string } & Partial<AztecNodeConfig>;

/** Context for an end-to-end test as returned by the `setup` function */
export type EndToEndContext = {
  /** The Aztec Node service or client a connected to it. */
  aztecNode: AztecNode | undefined;
  /** The Private eXecution Environment (PXE). */
  pxe: PXE;
  /** Return values from deployL1Contracts function. */
  deployL1ContractsValues: DeployL1Contracts;
  /** The accounts created by the PXE. */
  accounts: CompleteAddress[];
  /** The Aztec Node configuration. */
  config: AztecNodeConfig;
  /** The first wallet to be used. */
  wallet: AccountWalletWithPrivateKey;
  /** The wallets to be used. */
  wallets: AccountWalletWithPrivateKey[];
  /** Logger instance named as the current test. */
  logger: DebugLogger;
  /** The cheat codes. */
  cheatCodes: CheatCodes;
  /** Function to stop the started services. */
  teardown: () => Promise<void>;
};

/**
 * Sets up the environment for the end-to-end tests.
 * @param numberOfAccounts - The number of new accounts to be created once the PXE is initiated.
 * @param opts - Options to pass to the node initialisation and to the setup script.
 */
export async function setup(numberOfAccounts = 1, opts: SetupOptions = {}): Promise<EndToEndContext> {
  const config = { ...getConfigEnvVars(), ...opts };

  // Enable logging metrics to a local file named after the test suite
  if (isMetricsLoggingRequested()) {
    const filename = path.join('log', getJobName() + '.jsonl');
    setupMetricsLogger(filename);
  }

  if (opts.stateLoad) {
    const ethCheatCodes = new EthCheatCodes(config.rpcUrl);
    await ethCheatCodes.loadChainState(opts.stateLoad);
  }

  const logger = getLogger();
  const hdAccount = mnemonicToAccount(MNEMONIC);

  if (PXE_URL) {
    // we are setting up against the sandbox, l1 contracts are already deployed
    return await setupWithSandbox(hdAccount, config, logger);
  }

  const deployL1ContractsValues = await setupL1Contracts(config.rpcUrl, hdAccount, logger);
  const privKeyRaw = hdAccount.getHdKey().privateKey;
  const publisherPrivKey = privKeyRaw === null ? null : Buffer.from(privKeyRaw);

  config.publisherPrivateKey = `0x${publisherPrivKey!.toString('hex')}`;
  config.l1Contracts.rollupAddress = deployL1ContractsValues.l1ContractAddresses.rollupAddress;
  config.l1Contracts.registryAddress = deployL1ContractsValues.l1ContractAddresses.registryAddress;
  config.l1Contracts.contractDeploymentEmitterAddress =
    deployL1ContractsValues.l1ContractAddresses.contractDeploymentEmitterAddress;
  config.l1Contracts.inboxAddress = deployL1ContractsValues.l1ContractAddresses.inboxAddress;
  config.l1Contracts.outboxAddress = deployL1ContractsValues.l1ContractAddresses.outboxAddress;

  logger('Creating and synching an aztec node...');
  const aztecNode = await AztecNodeService.createAndSync(config);

  const { pxe, accounts, wallets } = await setupPXEService(numberOfAccounts, aztecNode!, logger);

  const cheatCodes = await CheatCodes.create(config.rpcUrl, pxe!);

  const teardown = async () => {
    if (aztecNode instanceof AztecNodeService) await aztecNode?.stop();
    if (pxe instanceof PXEService) await pxe?.stop();
  };

  return {
    aztecNode,
    pxe,
    deployL1ContractsValues,
    accounts,
    config,
    wallet: wallets[0],
    wallets,
    logger,
    cheatCodes,
    teardown,
  };
}

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
  return createDebugLogger('aztec:' + describeBlockName);
}

/**
 * Deploy L1 token and portal, initialize portal, deploy a non native l2 token contract, its L2 bridge contract and attach is to the portal.
 * @param wallet - the wallet instance
 * @param walletClient - A viem WalletClient.
 * @param publicClient - A viem PublicClient.
 * @param rollupRegistryAddress - address of rollup registry to pass to initialize the token portal
 * @param owner - owner of the L2 contract
 * @param underlyingERC20Address - address of the underlying ERC20 contract to use (if none supplied, it deploys one)
 * @returns l2 contract instance, bridge contract instance, token portal instance, token portal address and the underlying ERC20 instance
 */
export async function deployAndInitializeTokenAndBridgeContracts(
  wallet: Wallet,
  walletClient: WalletClient<HttpTransport, Chain, Account>,
  publicClient: PublicClient<HttpTransport, Chain>,
  rollupRegistryAddress: EthAddress,
  owner: AztecAddress,
  underlyingERC20Address?: EthAddress,
): Promise<{
  /**
   * The L2 token contract instance.
   */
  token: TokenContract;
  /**
   * The L2 bridge contract instance.
   */
  bridge: TokenBridgeContract;
  /**
   * The token portal contract address.
   */
  tokenPortalAddress: EthAddress;
  /**
   * The token portal contract instance
   */
  tokenPortal: any;
  /**
   * The underlying ERC20 contract instance.
   */
  underlyingERC20: any;
}> {
  if (!underlyingERC20Address) {
    underlyingERC20Address = await deployL1Contract(walletClient, publicClient, PortalERC20Abi, PortalERC20Bytecode);
  }
  const underlyingERC20 = getContract({
    address: underlyingERC20Address.toString(),
    abi: PortalERC20Abi,
    walletClient,
    publicClient,
  });

  // deploy the token portal
  const tokenPortalAddress = await deployL1Contract(walletClient, publicClient, TokenPortalAbi, TokenPortalBytecode);
  const tokenPortal = getContract({
    address: tokenPortalAddress.toString(),
    abi: TokenPortalAbi,
    walletClient,
    publicClient,
  });

  // deploy l2 token
  const deployTx = TokenContract.deploy(wallet, owner).send();

  // now wait for the deploy txs to be mined. This way we send all tx in the same rollup.
  const deployReceipt = await deployTx.wait();
  if (deployReceipt.status !== TxStatus.MINED) throw new Error(`Deploy token tx status is ${deployReceipt.status}`);
  const token = await TokenContract.at(deployReceipt.contractAddress!, wallet);

  // deploy l2 token bridge and attach to the portal
  const bridge = await TokenBridgeContract.deploy(wallet, token.address)
    .send({ portalContract: tokenPortalAddress })
    .deployed();

  if ((await token.methods.admin().view()) !== owner.toBigInt()) throw new Error(`Token admin is not ${owner}`);

  if ((await bridge.methods.token().view()) !== token.address.toBigInt())
    throw new Error(`Bridge token is not ${token.address}`);

  // make the bridge a minter on the token:
  const makeMinterTx = token.methods.set_minter(bridge.address, true).send();
  const makeMinterReceipt = await makeMinterTx.wait();
  if (makeMinterReceipt.status !== TxStatus.MINED)
    throw new Error(`Make bridge a minter tx status is ${makeMinterReceipt.status}`);
  if ((await token.methods.is_minter(bridge.address).view()) === 1n) throw new Error(`Bridge is not a minter`);

  // initialize portal
  await tokenPortal.write.initialize(
    [rollupRegistryAddress.toString(), underlyingERC20Address.toString(), bridge.address.toString()],
    {} as any,
  );

  return { token, bridge, tokenPortalAddress, tokenPortal, underlyingERC20 };
}

/**
 * Deploy L1 token and portal, initialize portal, deploy a non native l2 token contract and attach is to the portal.
 * @param wallet - Aztec wallet instance.
 * @param walletClient - A viem WalletClient.
 * @param publicClient - A viem PublicClient.
 * @param rollupRegistryAddress - address of rollup registry to pass to initialize the token portal
 * @param initialBalance - initial balance of the owner of the L2 contract
 * @param owner - owner of the L2 contract
 * @param underlyingERC20Address - address of the underlying ERC20 contract to use (if none supplied, it deploys one)
 * @returns l2 contract instance, token portal instance, token portal address and the underlying ERC20 instance
 */
// TODO (#2291) DELETE!!!
export async function deployAndInitializeNonNativeL2TokenContracts(
  wallet: Wallet,
  walletClient: WalletClient<HttpTransport, Chain, Account>,
  publicClient: PublicClient<HttpTransport, Chain>,
  rollupRegistryAddress: EthAddress,
  initialBalance = 0n,
  owner = AztecAddress.ZERO,
  underlyingERC20Address?: EthAddress,
) {
  // deploy underlying contract if no address supplied
  if (!underlyingERC20Address) {
    underlyingERC20Address = await deployL1Contract(walletClient, publicClient, PortalERC20Abi, PortalERC20Bytecode);
  }
  const underlyingERC20: any = getContract({
    address: underlyingERC20Address.toString(),
    abi: PortalERC20Abi,
    walletClient,
    publicClient,
  });

  // deploy the token portal
  const tokenPortalAddress = await deployL1Contract(walletClient, publicClient, TokenPortalAbi, TokenPortalBytecode);
  const tokenPortal: any = getContract({
    address: tokenPortalAddress.toString(),
    abi: TokenPortalAbi,
    walletClient,
    publicClient,
  });

  // deploy l2 contract and attach to portal
  const l2Contract = await NonNativeTokenContract.deploy(wallet, initialBalance, owner)
    .send({ portalContract: tokenPortalAddress })
    .deployed();
  const l2TokenAddress = l2Contract.address.toString();

  // initialize portal
  await tokenPortal.write.initialize(
    [rollupRegistryAddress.toString(), underlyingERC20Address.toString(), l2TokenAddress],
    {} as any,
  );
  return { l2Contract, tokenPortalAddress, tokenPortal, underlyingERC20 };
}

/**
 * Sleep for a given number of milliseconds.
 * @param ms - the number of milliseconds to sleep for
 */
export function delay(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * Checks the number of encrypted logs in the last block is as expected.
 * @param aztecNode - The instance of aztec node for retrieving the logs.
 * @param numEncryptedLogs - The number of expected logs.
 */
export const expectsNumOfEncryptedLogsInTheLastBlockToBe = async (
  aztecNode: AztecNode | undefined,
  numEncryptedLogs: number,
) => {
  if (!aztecNode) {
    // An api for retrieving encrypted logs does not exist on the PXE Service so we have to use the node
    // This means we can't perform this check if there is no node
    return;
  }
  const l2BlockNum = await aztecNode.getBlockNumber();
  const encryptedLogs = await aztecNode.getLogs(l2BlockNum, 1, LogType.ENCRYPTED);
  const unrolledLogs = L2BlockL2Logs.unrollLogs(encryptedLogs);
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
