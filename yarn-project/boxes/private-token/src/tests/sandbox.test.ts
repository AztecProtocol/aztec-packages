import {
  AccountWallet,
  AztecAddress,
  CompleteAddress,
  Contract,
  Fr,
  Wallet,
  getSandboxAccountsWallets,
} from '@aztec/aztec.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { PrivateTokenContract } from '../artifacts/PrivateToken.js';
import { rpcClient } from '../config.js';
import { deployContract } from '../scripts/deploy_contract.js';

const logger = createDebugLogger('aztec:http-rpc-client');

function getRandomInt(min: number, max: number): bigint {
  min = Math.ceil(min);
  max = Math.floor(max);
  return BigInt(Math.floor(Math.random() * (max - min)) + min);
}

const MIN_INITIAL_BALANCE = 300;
const MAX_INITIAL_BALANCE = 600;
const INITIAL_BALANCE = getRandomInt(MIN_INITIAL_BALANCE, MAX_INITIAL_BALANCE);
const TRANSFER_AMOUNT = 44n;
const MINT_AMOUNT = 11n;

async function deployZKContract(owner: CompleteAddress, wallet: Wallet) {
  logger('Deploying L2 contract...');
  // const constructorFunctionAbi = PrivateTokenContract.abi.functions.find(f => f.name === 'constructor');
  const constructorArgs = {
    // eslint-disable-next-line camelcase
    initial_supply: INITIAL_BALANCE,
    owner: owner.address,
  };
  const contractAddress = await deployContract(owner, PrivateTokenContract.abi, constructorArgs, Fr.ZERO, rpcClient);

  logger(`L2 contract deployed at ${contractAddress}`);
  const contract = await PrivateTokenContract.at(contractAddress, wallet);
  return contract;
}

async function getBalance(contract: Contract, ownerAddress: AztecAddress) {
  return await contract.methods.getBalance(ownerAddress).view({ from: ownerAddress });
}

describe('ZK Contract Tests', () => {
  let wallet: AccountWallet;
  let owner: CompleteAddress;
  let account2: CompleteAddress;
  let _account3: CompleteAddress;
  let zkContract: Contract;

  beforeAll(async () => {
    wallet = (await getSandboxAccountsWallets(rpcClient))[0];
    const accounts = await rpcClient.getAccounts();
    [owner, account2, _account3] = accounts;

    zkContract = await deployZKContract(owner, wallet);
  }, 30000);

  test('Initial balance is correct', async () => {
    const balance = await getBalance(zkContract, owner.address);
    expect(balance).toEqual(INITIAL_BALANCE);
  }, 41000);

  test('Balance after mint is correct', async () => {
    const mintTx = zkContract.methods.mint(MINT_AMOUNT, owner.address).send();
    await mintTx.wait({ interval: 0.5 });

    const balanceAfterMint = await getBalance(zkContract, owner.address);
    expect(balanceAfterMint).toEqual(INITIAL_BALANCE + MINT_AMOUNT);
  }, 42000);

  test('Balance after transfer is correct for both sender and receiver', async () => {
    const transferTx = zkContract.methods.transfer(TRANSFER_AMOUNT, account2.address).send();
    await transferTx.wait({ interval: 0.5 });

    const balanceAfterTransfer = await getBalance(zkContract, owner.address);
    expect(balanceAfterTransfer).toEqual(INITIAL_BALANCE + MINT_AMOUNT - TRANSFER_AMOUNT);

    const receiverBalance = await getBalance(zkContract, account2.address);
    expect(receiverBalance).toEqual(TRANSFER_AMOUNT);
  }, 43000);
});
