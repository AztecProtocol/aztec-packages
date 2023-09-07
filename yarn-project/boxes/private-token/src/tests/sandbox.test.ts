import {
  AztecAddress,
  CompleteAddress,
  Contract,
  GrumpkinScalar,
  Wallet,
  createAztecRpcClient,
  getSandboxAccountsWallet,
} from '@aztec/aztec.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { PrivateTokenContract } from '../artifacts/PrivateToken.js';
import { rpcClient } from '../config.js';

const logger = createDebugLogger('aztec:http-rpc-client');

export const privateKey = GrumpkinScalar.fromString('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

const url = 'http://localhost:8080';

const aztecRpcClient = createAztecRpcClient(url);
let wallet: Wallet;

const INITIAL_BALANCE = 333n;
const SECONDARY_AMOUNT = 33n;

async function deployZKContract(owner: AztecAddress) {
  logger('Deploying L2 contract...');
  const tx = PrivateTokenContract.deploy(aztecRpcClient, INITIAL_BALANCE, owner).send();
  const receipt = await tx.getReceipt();
  const contract = await PrivateTokenContract.at(receipt.contractAddress!, wallet);
  await tx.isMined();
  logger('L2 contract deployed');
  return contract;
}

async function getBalance(contract: Contract, ownerAddress: AztecAddress) {
  return await contract.methods.getBalance(ownerAddress).view({ from: ownerAddress });
}

describe('ZK Contract Tests', () => {
  let wallet: Wallet;
  let owner: CompleteAddress;
  let account2: CompleteAddress;
  let zkContract: Contract;

  beforeAll(async () => {
    const wallet = await getSandboxAccountsWallet(rpcClient);
    const accounts = await rpcClient.getAccounts();
    [owner, account2] = accounts;

    zkContract = await deployZKContract(owner.address);
  });

  test('Initial balance is correct', async () => {
    const balance = await getBalance(zkContract, owner.address);
    expect(balance).toEqual(INITIAL_BALANCE);
  });

  test('Balance after mint is correct', async () => {
    const mintTx = zkContract.methods.mint(SECONDARY_AMOUNT, owner.address).send({ origin: owner.address });
    await mintTx.isMined({ interval: 0.5 });
    const balanceAfterMint = await getBalance(zkContract, owner.address);
    expect(balanceAfterMint).toEqual(INITIAL_BALANCE + SECONDARY_AMOUNT);
  });

  test('Balance after transfer is correct for both sender and receiver', async () => {
    const transferTx = zkContract.methods.transfer(SECONDARY_AMOUNT, account2.address).send({ origin: owner.address });
    await transferTx.isMined({ interval: 0.5 });
    const balanceAfterTransfer = await getBalance(zkContract, owner.address);
    const receiverBalance = await getBalance(zkContract, account2.address);
    expect(balanceAfterTransfer).toEqual(INITIAL_BALANCE + SECONDARY_AMOUNT - SECONDARY_AMOUNT);
    expect(receiverBalance).toEqual(SECONDARY_AMOUNT);
  });
});
