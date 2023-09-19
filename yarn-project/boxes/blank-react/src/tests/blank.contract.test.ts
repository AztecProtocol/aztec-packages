import { BlankContract } from '../artifacts/blank.js';
import { rpcClient } from '../config.js';
import { callContractFunction, deployContract, getWallet } from '../scripts/index.js';
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
  const contractAddress = await deployContract(owner, BlankContract.abi, [], Fr.random(), rpcClient);

  logger(`L2 contract deployed at ${contractAddress}`);
  const contract = await BlankContract.at(contractAddress, wallet);
  return contract;
}

async function call(contractAddress: AztecAddress, testTokenContract: Contract, address: CompleteAddress) {
  return await callContractFunction(
    contractAddress,
    testTokenContract.abi,
    'getPublicKey',
    [address.address.toField()],
    rpcClient,
    address,
  );
}

describe('ZK Contract Tests', () => {
  let wallet: AccountWallet;
  let owner: CompleteAddress;
  let _account2: CompleteAddress;
  let _account3: CompleteAddress;
  let testTokenContract: Contract;
  let contractAddress: AztecAddress;
  let rpcClient: AztecRPC;

  beforeAll(async () => {
    rpcClient = await setupSandbox();
    const accounts = await rpcClient.getRegisteredAccounts();
    [owner, _account2, _account3] = accounts;

    wallet = await getWallet(owner, rpcClient);

    testTokenContract = await deployZKContract(owner, wallet, rpcClient);
    contractAddress = testTokenContract.address;
  }, 60000);

  test('call succeeds after deploy', async () => {
    const callTx = call(contractAddress, testTokenContract, owner);
    await callTx;
  }, 40000);
});
