import { Contract, ContractDeployer, SentTx, createAztecRpcClient } from '@aztec/aztec.js';
import { AztecAddress, Point } from '@aztec/circuits.js';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { createDebugLogger } from '@aztec/foundation/log';
import { ZkTokenContractAbi } from '@aztec/noir-contracts/examples';

const logger = createDebugLogger('aztec:http-rpc-client');

export const privateKey = Buffer.from('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', 'hex');

const aztecRpcClient = createAztecRpcClient(new URL('http://localhost:8080'));

const INITIAL_BALANCE = 333n;

const pointToPublicKey = (point: Point) => {
  const x = point.buffer.subarray(0, 32);
  const y = point.buffer.subarray(32, 64);
  return {
    x: toBigIntBE(x),
    y: toBigIntBE(y),
  };
};

/**
 * Creates an Aztec Account.
 * @returns The account's address & public key.
 */
async function createAccount(): Promise<[AztecAddress, Point]> {
  const [txHash, newAddress] = await aztecRpcClient.createSmartAccount(privateKey);
  // wait for tx to get mined
  await new SentTx(aztecRpcClient, Promise.resolve(txHash)).isMined();
  const pubKey = await aztecRpcClient.getAccountPublicKey(newAddress);
  logger(`Created account ${newAddress.toString()} with public key ${pubKey.toString()}`);
  return [newAddress, pubKey];
}

/**
 * Deploys the ZK Token contract.
 * @param pubKeyPoint - The public key Point that the initial balance will belong to.
 * @returns An Aztec Contract object with the zk token's ABI.
 */
async function deployZKContract(pubKeyPoint: Point) {
  logger('Deploying L2 contract...');
  const deployer = new ContractDeployer(ZkTokenContractAbi, aztecRpcClient);
  const tx = deployer.deploy(INITIAL_BALANCE, pointToPublicKey(pubKeyPoint)).send();
  const receipt = await tx.getReceipt();
  const contract = new Contract(receipt.contractAddress!, ZkTokenContractAbi, aztecRpcClient);
  await tx.isMined();
  await tx.getReceipt();
  logger('L2 contract deployed');
  return contract;
}

/**
 * Main function.
 */
async function main() {
  logger('Running ZK contract test on HTTP interface.');
  const [address, pubKeyPoint] = await createAccount();
  const zkContract = await deployZKContract(pubKeyPoint);
  const accounts = await aztecRpcClient.getAccounts();
  logger(`Created ${accounts.length} accounts`);
  const [balance1] = await zkContract.methods.getBalance(pointToPublicKey(pubKeyPoint)).view({ from: address });
  logger(`Initial owner balance: ${balance1}`);
  expect(balance1).toBe(INITIAL_BALANCE);
}

main()
  .then(() => {
    logger('Finished running successfuly.');
    process.exit(0);
  })
  .catch(err => {
    logger('Error in main fn: ', err);
    process.exit(1);
  });
