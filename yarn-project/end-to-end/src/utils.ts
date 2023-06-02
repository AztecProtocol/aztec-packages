import { AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { DeployL1Contracts, deployL1Contracts } from '@aztec/ethereum';
import { mnemonicToAccount } from 'viem/accounts';
import { MNEMONIC, localAnvil } from './fixtures.js';
import {
  AztecAddress,
  AztecRPCServer,
  Contract,
  ContractDeployer,
  EthAddress,
  Point,
  createAztecRPCServer,
} from '@aztec/aztec.js';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { NonNativeTokenContractAbi } from '@aztec/noir-contracts/examples';

/**
 * Sets up the environment for the end-to-end tests.
 * @param numberOfAccounts - The number of new accounts to be created once the RPC server is initiated.
 */
export async function setup(numberOfAccounts = 1): Promise<{
  /**
   * The Aztec Node service.
   */
  aztecNode: AztecNodeService;
  /**
   * The Aztec RPC server.
   */
  aztecRpcServer: AztecRPCServer;
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
   * Logger instance named as the current test.
   */
  logger: DebugLogger;
}> {
  const config = getConfigEnvVars();

  const describeBlockName = expect.getState().currentTestName?.split(' ')[0];

  const logger = createDebugLogger('aztec:' + describeBlockName);

  const hdAccount = mnemonicToAccount(MNEMONIC);
  const privKey = hdAccount.getHdKey().privateKey;
  const deployL1ContractsValues = await deployL1Contracts(config.rpcUrl, hdAccount, localAnvil, logger);

  config.publisherPrivateKey = Buffer.from(privKey!);
  config.rollupContract = deployL1ContractsValues.rollupAddress;
  config.unverifiedDataEmitterContract = deployL1ContractsValues.unverifiedDataEmitterAddress;
  config.inboxContract = deployL1ContractsValues.inboxAddress;

  const aztecNode = await AztecNodeService.createAndSync(config);
  const aztecRpcServer = await createAztecRPCServer(aztecNode);
  for (let i = 0; i < numberOfAccounts; ++i) {
    await aztecRpcServer.addAccount();
  }

  const accounts = await aztecRpcServer.getAccounts();

  return {
    aztecNode,
    aztecRpcServer,
    deployL1ContractsValues,
    accounts,
    config,
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
 * Converts a point to a public key.
 * @param point - the point to convert to
 * @returns two big ints x,y representing the public key
 */
export function pointToPublicKey(point: Point) {
  const x = point.buffer.subarray(0, 32);
  const y = point.buffer.subarray(32, 64);
  return {
    x: toBigIntBE(x),
    y: toBigIntBE(y),
  };
}

/**
 * Deploy a non native l2 token contract and attach is to a portal on L1
 * @param aztecRpcServer - the aztec rpc server instance
 * @param tokenPortalAddress - address of token portal to attach to the L2 contract
 * @param initialBalance - initial balance of the owner of the L2 contract
 * @param owner - owner of the L2 contract
 * @returns contract instance
 */
export async function deployNonNativeL2TokenContract(
  aztecRpcServer: AztecRPCServer,
  tokenPortalAddress: EthAddress,
  initialBalance = 0n,
  owner = { x: 0n, y: 0n },
): Promise<Contract> {
  const deployer = new ContractDeployer(NonNativeTokenContractAbi, aztecRpcServer);
  const tx = deployer.deploy(initialBalance, owner).send({
    portalContract: tokenPortalAddress,
  });
  const receipt = await tx.getReceipt();
  const contract = new Contract(receipt.contractAddress!, NonNativeTokenContractAbi, aztecRpcServer);
  await contract.attach(tokenPortalAddress);

  await tx.isMined(0, 0.1);
  await tx.getReceipt();
  return contract;
}

/**
 * Sleep for a given number of milliseconds.
 * @param ms - the number of milliseconds to sleep for
 */
export function delay(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}
