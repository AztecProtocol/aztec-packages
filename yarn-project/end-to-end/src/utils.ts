import { AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { RpcServerConfig, createAztecRPCServer, getConfigEnvVars as getRpcConfigEnvVars } from '@aztec/aztec-rpc';
import {
  AccountCollection,
  AccountWallet,
  AztecAddress,
  Contract,
  ContractDeployer,
  DeployMethod,
  EthAddress,
  SentTx,
  SingleKeyAccountContract,
  Wallet,
  createAztecRpcClient as createJsonRpcClient,
  generatePublicKey,
  getL1ContractAddresses,
} from '@aztec/aztec.js';
import { CircuitsWasm, DeploymentInfo, getContractDeploymentInfo } from '@aztec/circuits.js';
import { Schnorr, pedersenPlookupCommitInputs } from '@aztec/circuits.js/barretenberg';
import { DeployL1Contracts, deployL1Contract, deployL1Contracts } from '@aztec/ethereum';
import { ContractAbi } from '@aztec/foundation/abi';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { DebugLogger, Logger, createDebugLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { PortalERC20Abi, PortalERC20Bytecode, TokenPortalAbi, TokenPortalBytecode } from '@aztec/l1-artifacts';
import { NonNativeTokenContractAbi, SchnorrAccountContractAbi } from '@aztec/noir-contracts/examples';
import { NonNativeTokenContract } from '@aztec/noir-contracts/types';
import { AztecRPC, TxStatus } from '@aztec/types';

import every from 'lodash.every';
import zipWith from 'lodash.zipwith';
import {
  Account,
  Chain,
  HDAccount,
  HttpTransport,
  PublicClient,
  WalletClient,
  createPublicClient,
  createWalletClient,
  getContract,
  http,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC, localAnvil } from './fixtures.js';

const { SANDBOX_URL = '' } = process.env;

const waitForRPCServer = async (rpcServer: AztecRPC, logger: Logger) => {
  await retryUntil(async () => {
    try {
      logger('Attmpting to contact RPC Server...');
      await rpcServer.getNodeInfo();
      return true;
    } catch (error) {
      logger('Failed to contact RPC Server!');
    }
    return undefined;
  }, 'RPC Get Block Number');
};

const createRpcServer = async (
  nodeConfig: AztecNodeConfig,
  rpcConfig: RpcServerConfig,
  logger: Logger,
): Promise<[AztecNodeService | undefined, AztecRPC]> => {
  if (SANDBOX_URL) {
    logger(`Creating JSON RPC client to remote host ${SANDBOX_URL}`);
    const jsonClient = createJsonRpcClient(SANDBOX_URL);
    await waitForRPCServer(jsonClient, logger);
    logger('JSON RPC client connected to RPC Server');
    return [undefined, jsonClient];
  }
  const aztecNode = await AztecNodeService.createAndSync(nodeConfig);
  return [aztecNode, await createAztecRPCServer(aztecNode, rpcConfig)];
};

const setupL1Contracts = async (config: AztecNodeConfig, account: HDAccount, logger: Logger) => {
  if (SANDBOX_URL) {
    logger(`Retrieving contract addresses from ${SANDBOX_URL}`);
    const l1Contracts = await getL1ContractAddresses(SANDBOX_URL);

    const walletClient = createWalletClient<HttpTransport, Chain, HDAccount>({
      account,
      chain: localAnvil,
      transport: http(config.rpcUrl),
    });
    const publicClient = createPublicClient({
      chain: localAnvil,
      transport: http(config.rpcUrl),
    });
    return {
      rollupAddress: l1Contracts.rollup,
      registryAddress: l1Contracts.registry,
      inboxAddress: l1Contracts.inbox,
      outboxAddress: l1Contracts.outbox,
      contractDeploymentEmitterAddress: l1Contracts.contractDeploymentEmitter,
      decoderHelperAddress: l1Contracts.decoderHelper,
      walletClient,
      publicClient,
    };
  }
  return await deployL1Contracts(config.rpcUrl, account, localAnvil, logger);
};

/**
 * Container to hold information about txs
 */
type TxContext = {
  /**
   * The fully built and sent transaction.
   */
  tx: SentTx | undefined;
  /**
   * The deploy method.
   */
  deployMethod: DeployMethod;

  /**
   * Contract address salt.
   */
  salt: Fr;

  /**
   * The user's private key.
   */
  privateKey: Buffer;
  /**
   * The fully derived deployment data.
   */
  deploymentData: DeploymentInfo;
};

/**
 * Sets up the environment for the end-to-end tests.
 * @param numberOfAccounts - The number of new accounts to be created once the RPC server is initiated.
 */
export async function setup(numberOfAccounts = 1): Promise<{
  /**
   * The Aztec Node instance or undefined if one wasn't created.
   */
  aztecNode: AztecNodeService | undefined;
  /**
   * The Aztec RPC instance.
   */
  aztecRpcServer: AztecRPC;
  /**
   * Return values from deployL1Contracts function.
   */
  deployL1ContractsValues: DeployL1Contracts;
  /**
   * The accounts created by the RPC server.
   */
  accounts: AztecAddress[];
  /**
   * The Aztec Node configuration.
   */
  config: AztecNodeConfig;
  /**
   * The wallet to be used.
   */
  wallet: Wallet;
  /**
   * Logger instance named as the current test.
   */
  logger: DebugLogger;
}> {
  await CircuitsWasm.get();
  const config = getConfigEnvVars();
  const rpcConfig = getRpcConfigEnvVars();
  const logger = getLogger();

  logger('Setting up L1 contracts...');

  const hdAccount = mnemonicToAccount(MNEMONIC);
  const privKey = hdAccount.getHdKey().privateKey;
  const deployL1ContractsValues = await setupL1Contracts(config, hdAccount, logger);

  logger('L1 contract setup completed, creating RPC server...');

  config.publisherPrivateKey = Buffer.from(privKey!);
  config.rollupContract = deployL1ContractsValues.rollupAddress;
  config.contractDeploymentEmitterContract = deployL1ContractsValues.contractDeploymentEmitterAddress;
  config.inboxContract = deployL1ContractsValues.inboxAddress;

  const [aztecNode, aztecRpcServer] = await createRpcServer(config, rpcConfig, logger);
  const accountCollection = new AccountCollection();
  const txContexts: TxContext[] = [];

  logger('RPC server created, deploying accounts...');

  await aztecRpcServer.getNodeInfo();

  for (let i = 0; i < numberOfAccounts; ++i) {
    // We use the well-known private key and the validating account contract for the first account,
    // and generate random key pairs for the rest.
    // TODO(#662): Let the aztec rpc server generate the key pair rather than hardcoding the private key
    const privateKey = i === 0 ? Buffer.from(privKey!) : randomBytes(32);
    await aztecRpcServer.getNodeInfo();
    logger('Generating public key...');
    const publicKey = await generatePublicKey(privateKey);
    await aztecRpcServer.getNodeInfo();
    const salt = Fr.random();
    logger('Generating contract deployment info...');
    const deploymentData = await getContractDeploymentInfo(SchnorrAccountContractAbi, [], salt, publicKey);
    const nodeInfo = await aztecRpcServer.getNodeInfo();
    logger(`Retrieved node info`, nodeInfo);
    const blockNumber = await aztecRpcServer.getBlockNum();
    logger(`Retrieved block number ${blockNumber}`);
    await aztecRpcServer.addAccount(privateKey, deploymentData.address, deploymentData.partialAddress);

    const contractDeployer = new ContractDeployer(SchnorrAccountContractAbi, aztecRpcServer, publicKey);
    const deployMethod = contractDeployer.deploy();
    await deployMethod.simulate({ contractAddressSalt: salt });
    txContexts.push({
      tx: undefined,
      deployMethod,
      salt,
      privateKey,
      deploymentData,
    });
  }

  // We do this in a seperate loop to try and get all transactions into the same rollup.
  // Doing this here will submit the transactions with minimal delay between them.
  for (const context of txContexts) {
    context.tx = context.deployMethod.send();
  }

  for (const context of txContexts) {
    const publicKey = await generatePublicKey(context.privateKey);
    await context.tx!.isMined(0, 0.1);
    const receipt = await context.tx!.getReceipt();
    if (receipt.status !== TxStatus.MINED) {
      throw new Error(`Deployment tx not mined (status is ${receipt.status})`);
    }
    const receiptAddress = receipt.contractAddress!;
    if (!receiptAddress.equals(context.deploymentData.address)) {
      throw new Error(
        `Deployment address does not match for account contract (expected ${context.deploymentData.address} got ${receiptAddress})`,
      );
    }
    accountCollection.registerAccount(
      context.deploymentData.address,
      new SingleKeyAccountContract(
        context.deploymentData.address,
        context.deploymentData.partialAddress,
        context.privateKey,
        await Schnorr.new(),
      ),
    );
    logger(`Created account ${context.deploymentData.address.toString()} with public key ${publicKey.toString()}`);
  }

  const accounts = await aztecRpcServer.getAccounts();
  const wallet = new AccountWallet(aztecRpcServer, accountCollection);

  return {
    aztecNode,
    aztecRpcServer,
    deployL1ContractsValues,
    accounts,
    config,
    wallet,
    logger,
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

/**
 * Deploys a set of contracts to the network.
 * @param wallet - the wallet to make the request.
 * @param abi - contracts to be deployed.
 * @returns The deployed contract instances.
 */
export async function deployL2Contracts(wallet: Wallet, abis: ContractAbi[]) {
  const logger = getLogger();
  const calls = await Promise.all(abis.map(abi => new ContractDeployer(abi, wallet).deploy()));
  for (const call of calls) await call.create();
  const txs = await Promise.all(calls.map(c => c.send()));
  expect(every(await Promise.all(txs.map(tx => tx.isMined(0, 0.1))))).toBeTruthy();
  const receipts = await Promise.all(txs.map(tx => tx.getReceipt()));
  const contracts = zipWith(abis, receipts, (abi, receipt) => new Contract(receipt!.contractAddress!, abi!, wallet));
  contracts.forEach(c => logger(`L2 contract ${c.abi.name} deployed at ${c.address}`));
  return contracts;
}

/**
 * Returns a logger instance for the current test.
 * @returns a logger instance for the current test.
 */
export function getLogger() {
  const describeBlockName = expect.getState().currentTestName?.split(' ')[0];
  return createDebugLogger('aztec:' + describeBlockName);
}

/**
 * Deploy L1 token and portal, initialize portal, deploy a non native l2 token contract and attach is to the portal.
 * @param aztecRpcServer - the aztec rpc server instance
 * @param walletClient - A viem WalletClient.
 * @param publicClient - A viem PublicClient.
 * @param rollupRegistryAddress - address of rollup registry to pass to initialize the token portal
 * @param initialBalance - initial balance of the owner of the L2 contract
 * @param owner - owner of the L2 contract
 * @param underlyingERC20Address - address of the underlying ERC20 contract to use (if noone supplied, it deploys one)
 * @returns l2 contract instance, token portal instance, token portal address and the underlying ERC20 instance
 */
export async function deployAndInitializeNonNativeL2TokenContracts(
  wallet: Wallet,
  walletClient: WalletClient<HttpTransport, Chain, Account>,
  publicClient: PublicClient<HttpTransport, Chain>,
  rollupRegistryAddress: EthAddress,
  initialBalance = 0n,
  owner = { x: 0n, y: 0n },
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
  const deployer = new ContractDeployer(NonNativeTokenContractAbi, wallet);
  const tx = deployer.deploy(initialBalance, owner).send({
    portalContract: tokenPortalAddress,
    contractAddressSalt: Fr.random(),
  });
  await tx.isMined(0, 0.1);
  const receipt = await tx.getReceipt();
  if (receipt.status !== TxStatus.MINED) throw new Error(`Tx status is ${receipt.status}`);
  const l2Contract = new NonNativeTokenContract(receipt.contractAddress!, wallet);
  await l2Contract.attach(tokenPortalAddress);
  const l2TokenAddress = l2Contract.address.toString() as `0x${string}`;

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
 * Calculates the slot value of a mapping within noir.
 * @param slot - The storage slot of the mapping.
 * @param key - The key within the mapping.
 * @returns The mapping's key.
 */
export async function calculateAztecStorageSlot(slot: bigint, key: Fr): Promise<Fr> {
  const wasm = await CircuitsWasm.get();
  const mappingStorageSlot = new Fr(slot); // this value is manually set in the Noir contract

  // Based on `at` function in
  // aztec3-packages/yarn-project/noir-contracts/src/contracts/noir-aztec/src/state_vars/map.nr
  const storageSlot = Fr.fromBuffer(
    pedersenPlookupCommitInputs(
      wasm,
      [mappingStorageSlot, key].map(f => f.toBuffer()),
    ),
  );

  return storageSlot; //.value;
}

/**
 * Check the value of a public mapping's storage slot.
 * @param logger - A logger instance.
 * @param aztecNode - An instance of the aztec node service.
 * @param contract - The contract to check the storage slot of.
 * @param slot - The mapping's storage slot.
 * @param key - The mapping's key.
 * @param expectedValue - The expected value of the mapping.
 */
export async function expectAztecStorageSlot(
  logger: Logger,
  aztecRpc: AztecRPC,
  contract: Contract,
  slot: bigint,
  key: Fr,
  expectedValue: bigint,
) {
  const storageSlot = await calculateAztecStorageSlot(slot, key);
  const storageValue = await aztecRpc.getPublicStorageAt(contract.address!, storageSlot);
  if (storageValue === undefined) {
    throw new Error(`Storage slot ${storageSlot} not found`);
  }

  const balance = toBigIntBE(storageValue);

  logger(`Account ${key.toShortString()} balance: ${balance}`);
  expect(balance).toBe(expectedValue);
}
