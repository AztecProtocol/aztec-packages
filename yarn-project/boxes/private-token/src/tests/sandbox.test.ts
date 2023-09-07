import { AztecAddress, CompleteAddress, Contract, Wallet, getSandboxAccountsWallet } from '@aztec/aztec.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { PrivateTokenContract } from '../artifacts/PrivateToken.js';
import { rpcClient } from '../config.js';

const logger = createDebugLogger('aztec:http-rpc-client');

const INITIAL_BALANCE = 333n;
const TRANSFER_AMOUNT = 33n;
const MINT_AMOUNT = 11n;

async function deployZKContract(owner: AztecAddress, wallet: Wallet) {
  logger('Deploying L2 contract...');
  const tx = PrivateTokenContract.deploy(rpcClient, INITIAL_BALANCE, owner).send();
  const receipt = await tx.getReceipt();
  const contract = await PrivateTokenContract.at(receipt.contractAddress!, wallet);
  await tx.wait();
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
    wallet = await getSandboxAccountsWallet(rpcClient);
    const accounts = await rpcClient.getAccounts();
    [owner, account2] = accounts;

    zkContract = await deployZKContract(owner.address, wallet);
  });

  test('Initial balance is correct', async () => {
    const balance = await getBalance(zkContract, owner.address);
    expect(balance).toEqual(INITIAL_BALANCE);
  });

  test('Balance after mint is correct', async () => {
    const mintTx = zkContract.methods.mint(MINT_AMOUNT, owner.address).send({ origin: owner.address });
    await mintTx.wait({ interval: 0.5 });
    const balanceAfterMint = await getBalance(zkContract, owner.address);
    expect(balanceAfterMint).toEqual(INITIAL_BALANCE + MINT_AMOUNT);
  });

  test('Balance after transfer is correct for both sender and receiver', async () => {
    const transferTx = zkContract.methods.transfer(TRANSFER_AMOUNT, account2.address).send({ origin: owner.address });
    await transferTx.wait({ interval: 0.5 });
    const balanceAfterTransfer = await getBalance(zkContract, owner.address);
    const receiverBalance = await getBalance(zkContract, account2.address);
    expect(balanceAfterTransfer).toEqual(INITIAL_BALANCE + MINT_AMOUNT - TRANSFER_AMOUNT);
    expect(receiverBalance).toEqual(TRANSFER_AMOUNT);
  });
});
