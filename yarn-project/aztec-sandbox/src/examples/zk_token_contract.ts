import { Contract, Wallet, createAccounts, createAztecRpcClient } from '@aztec/aztec.js';
import { AztecAddress, Fr, PrivateKey } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { SchnorrSingleKeyAccountContractAbi } from '@aztec/noir-contracts/artifacts';
import { ZkTokenContract } from '@aztec/noir-contracts/types';

const logger = createDebugLogger('aztec:http-rpc-client');

export const privateKey = PrivateKey.fromString('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

const url = 'http://localhost:8080';

const aztecRpcClient = createAztecRpcClient(url);
let wallet: Wallet;

const INITIAL_BALANCE = 333n;
const SECONDARY_AMOUNT = 33n;

/**
 * Deploys the ZK Token contract.
 * @param owner - The address that the initial balance will belong to.
 * @returns An Aztec Contract object with the zk token's ABI.
 */
async function deployZKContract(owner: AztecAddress) {
  logger('Deploying L2 contract...');
  const tx = ZkTokenContract.deploy(aztecRpcClient, INITIAL_BALANCE, owner).send();
  const receipt = await tx.getReceipt();
  const contract = await ZkTokenContract.create(receipt.contractAddress!, wallet);
  await tx.isMined();
  await tx.getReceipt();
  logger('L2 contract deployed');
  return contract;
}

/**
 * Gets a user's balance from a ZK Token contract.
 * @param contract - The ZK Token contract.
 * @param ownerAddress - Balance owner's Aztec Address.
 * @returns The owner's current balance of the token.
 */
async function getBalance(contract: Contract, ownerAddress: AztecAddress) {
  const [balance] = await contract.methods.getBalance(ownerAddress).view({ from: ownerAddress });
  return balance;
}

/**
 * Main function.
 */
async function main() {
  logger('Running ZK contract test on HTTP interface.');

  wallet = await createAccounts(aztecRpcClient, SchnorrSingleKeyAccountContractAbi, privateKey, Fr.random(), 2);
  const accounts = await aztecRpcClient.getAccounts();
  const [ownerAddress, address2] = accounts;
  logger(`Created ${accounts.length} accounts`);

  logger(`Created Owner account ${ownerAddress.toString()}`);

  const zkContract = await deployZKContract(ownerAddress);
  const [balance1] = await zkContract.methods.getBalance(ownerAddress).view({ from: ownerAddress });
  logger(`Initial owner balance: ${balance1}`);

  // Mint more tokens
  logger(`Minting ${SECONDARY_AMOUNT} more coins`);
  const mintTx = zkContract.methods.mint(SECONDARY_AMOUNT, ownerAddress).send({ origin: ownerAddress });
  await mintTx.isMined(0, 0.5);
  const balanceAfterMint = await getBalance(zkContract, ownerAddress);
  logger(`Owner's balance is now: ${balanceAfterMint}`);

  // Perform a transfer
  logger(`Transferring ${SECONDARY_AMOUNT} tokens from owner to another account.`);
  const transferTx = zkContract.methods
    .transfer(SECONDARY_AMOUNT, ownerAddress, address2)
    .send({ origin: ownerAddress });
  await transferTx.isMined(0, 0.5);
  const balanceAfterTransfer = await getBalance(zkContract, ownerAddress);
  const receiverBalance = await getBalance(zkContract, address2);
  logger(`Owner's balance is now ${balanceAfterTransfer}`);
  logger(`The transfer receiver's balance is ${receiverBalance}`);
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
