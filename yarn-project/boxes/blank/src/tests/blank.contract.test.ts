import {
  AccountWallet,
  AztecAddress,
  AztecRPC,
  CompleteAddress,
  Contract,
  Fr,
  Wallet,
  createAztecRpcClient,
  waitForSandbox,
} from '@aztec/aztec.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { BlankContract } from '../artifacts/blank.js';
import { callContractFunction, convertArgs, deployContract, getFunctionAbi, getWallet, rpcClient } from '../index.js';
const logger = createDebugLogger('aztec:http-rpc-client');

// assumes sandbox is running locally, which this script does not trigger
// as well as anvil.  anvil can be started with yarn test:integration
const setupSandbox = async () => {
  const { SANDBOX_URL = 'http://localhost:8080' } = process.env;
  const aztecRpc = createAztecRpcClient(SANDBOX_URL);
  await waitForSandbox(aztecRpc);
  return aztecRpc;
};

async function deployZKContract(owner: CompleteAddress, wallet: Wallet, rpcClient: AztecRPC) {
  logger('Deploying Blank contract...');
  const constructorArgs = {
    // eslint-disable-next-line camelcase
  };
  const constructorAbi = getFunctionAbi(BlankContract.abi, 'constructor');
  const typedArgs = convertArgs(constructorAbi, constructorArgs);

  const contractAddress = await deployContract(owner, BlankContract.abi, typedArgs, Fr.random(), rpcClient);

  logger(`L2 contract deployed at ${contractAddress}`);
  const contract = await BlankContract.at(contractAddress, wallet);
  return contract;
}

async function call(contractAddress: AztecAddress, privateTokenContract: Contract, address: CompleteAddress) {
  const getPkAbi = getFunctionAbi(BlankContract.abi, 'getPublicKey');
  const callArgs = { address: address.address };
  const typedArgs = convertArgs(getPkAbi, callArgs);

  return await callContractFunction(
    contractAddress,
    privateTokenContract.abi,
    'getPublicKey',
    typedArgs,
    rpcClient,
    address,
  );
}

describe('ZK Contract Tests', () => {
  let wallet: AccountWallet;
  let owner: CompleteAddress;
  let _account2: CompleteAddress;
  let _account3: CompleteAddress;
  let privateTokenContract: Contract;
  let contractAddress: AztecAddress;
  let rpcClient: AztecRPC;

  beforeAll(async () => {
    rpcClient = await setupSandbox();
    const accounts = await rpcClient.getRegisteredAccounts();
    [owner, _account2, _account3] = accounts;

    wallet = await getWallet(owner, rpcClient);

    privateTokenContract = await deployZKContract(owner, wallet, rpcClient);
    contractAddress = privateTokenContract.address;
  }, 60000);

  test('call succeeds after deploy', async () => {
    const callTx = call(contractAddress, privateTokenContract, owner);
    await callTx;
  }, 40000);
});
