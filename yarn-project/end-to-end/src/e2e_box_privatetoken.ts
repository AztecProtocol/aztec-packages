import {
  AccountWallet,
  AztecAddress,
  AztecRPC,
  CompleteAddress,
  Contract,
  Fr,
  Wallet,
  createAztecRpcClient,
  makeFetch,
  waitForSandbox,
} from '@aztec/aztec.js';
import {
  PrivateTokenContract,
  callContractFunction,
  deployContract,
  getWallet,
  rpcClient,
  viewContractFunction,
} from '@aztec/boxes/private-token';
import { createDebugLogger } from '@aztec/foundation/log';

import { setup } from './fixtures/utils.js';

const logger = createDebugLogger('aztec:http-rpc-client');

const INITIAL_BALANCE = 444n;
const TRANSFER_AMOUNT = 44n;
const MINT_AMOUNT = 11n;

const setupSandbox = async () => {
  const { SANDBOX_URL = 'http://localhost:8080' } = process.env;
  await setup(3);
  const aztecRpc = createAztecRpcClient(SANDBOX_URL, makeFetch([1, 2, 3], true));
  await waitForSandbox(aztecRpc);
  return aztecRpc;
};

// eslint-disable-next-line jsdoc/require-jsdoc
async function deployZKContract(owner: CompleteAddress, wallet: Wallet, rpcClient: AztecRPC) {
  logger('Deploying PrivateToken contract...');
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

// eslint-disable-next-line jsdoc/require-jsdoc
async function getBalance(contractAddress: AztecAddress, privateTokenContract: Contract, owner: CompleteAddress) {
  return await viewContractFunction(
    contractAddress,
    privateTokenContract.abi,
    'getBalance',
    { owner: owner.address },
    rpcClient,
    owner,
  );
}

// eslint-disable-next-line jsdoc/require-jsdoc
async function mint(
  contractAddress: AztecAddress,
  privateTokenContract: Contract,
  from: CompleteAddress,
  to: CompleteAddress,
) {
  return await callContractFunction(
    contractAddress,
    privateTokenContract.abi,
    'mint',
    { amount: MINT_AMOUNT, owner: to.address },
    rpcClient,
    from,
  );
}

// eslint-disable-next-line jsdoc/require-jsdoc
async function transfer(
  contractAddress: AztecAddress,
  privateTokenContract: Contract,
  from: CompleteAddress,
  to: CompleteAddress,
) {
  return await callContractFunction(
    contractAddress,
    privateTokenContract.abi,
    'transfer',
    { amount: TRANSFER_AMOUNT, recipient: to.address },
    rpcClient,
    from,
  );
}

describe('ZK Contract Tests', () => {
  let wallet: AccountWallet;
  let owner: CompleteAddress;
  let account2: CompleteAddress;
  let _account3: CompleteAddress;
  let privateTokenContract: Contract;
  let contractAddress: AztecAddress;
  let rpcClient: AztecRPC;

  beforeAll(async () => {
    rpcClient = await setupSandbox();
    const accounts = await rpcClient.getAccounts();
    [owner, account2, _account3] = accounts;

    wallet = await getWallet(owner, rpcClient);

    privateTokenContract = await deployZKContract(owner, wallet, rpcClient);
    contractAddress = privateTokenContract.address;
  }, 60000);

  test('Initial balance is correct', async () => {
    const balance = await getBalance(contractAddress, privateTokenContract, owner);
    expect(balance).toEqual(INITIAL_BALANCE);
  }, 40000);

  test('Balance after mint is correct', async () => {
    const mintTx = mint(contractAddress, privateTokenContract, owner, owner);
    await mintTx;

    const balanceAfterMint = await getBalance(contractAddress, privateTokenContract, owner);
    expect(balanceAfterMint).toEqual(INITIAL_BALANCE + MINT_AMOUNT);
  }, 40000);

  test('Balance after transfer is correct for both sender and receiver', async () => {
    const transferTx = transfer(contractAddress, privateTokenContract, owner, account2);
    await transferTx;

    const balanceAfterTransfer = await getBalance(contractAddress, privateTokenContract, owner);
    expect(balanceAfterTransfer).toEqual(INITIAL_BALANCE + MINT_AMOUNT - TRANSFER_AMOUNT);

    const receiverBalance = await getBalance(contractAddress, privateTokenContract, account2);
    expect(receiverBalance).toEqual(TRANSFER_AMOUNT);
  }, 40000);
});
