import { AztecNode, getConfigEnvVars } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, Contract, ContractDeployer, Fr, TxStatus } from '@aztec/aztec.js';
import { EthereumRpc } from '@aztec/ethereum.js/eth_rpc';
import { WalletProvider } from '@aztec/ethereum.js/provider';
import { EthAddress, createDebugLogger } from '@aztec/foundation';
import { ContractAbi } from '@aztec/noir-contracts';
import { ChildAbi, ParentAbi } from '@aztec/noir-contracts/examples';

import { createAztecRpcServer } from './create_aztec_rpc_client.js';
import { createProvider, deployRollupContract, deployUnverifiedDataEmitterContract } from './deploy_l1_contracts.js';

const MNEMONIC = 'test test test test test test test test test test test junk';

const logger = createDebugLogger('aztec:e2e_nested_contract');

const config = getConfigEnvVars();

describe('e2e_nested_contract', () => {
  let provider: WalletProvider;
  let node: AztecNode;
  let aztecRpcServer: AztecRPCServer;
  let rollupAddress: EthAddress;
  let unverifiedDataEmitterAddress: EthAddress;
  let accounts: AztecAddress[];
  const parentABI = ParentAbi as ContractAbi;
  const childABI = ChildAbi as ContractAbi;

  beforeEach(async () => {
    provider = createProvider(config.rpcUrl, MNEMONIC, 1);
    config.publisherPrivateKey = provider.getPrivateKey(0) || Buffer.alloc(32);
    const ethRpc = new EthereumRpc(provider);
    logger('Deploying contracts...');
    rollupAddress = await deployRollupContract(provider, ethRpc);
    unverifiedDataEmitterAddress = await deployUnverifiedDataEmitterContract(provider, ethRpc);
    config.rollupContract = rollupAddress;
    config.unverifiedDataEmitterContract = unverifiedDataEmitterAddress;
    logger('Deployed contracts...');
  });

  beforeEach(async () => {
    node = await AztecNode.createAndSync(config);
    aztecRpcServer = await createAztecRpcServer(1, node);
    accounts = await aztecRpcServer.getAccounts();
  }, 10_000);

  afterEach(async () => {
    await node.stop();
    await aztecRpcServer.stop();
  });

  const deployContract = async (abi: ContractAbi) => {
    // TODO: Remove explicit casts
    logger(`Deploying L2 contract ${abi.name}...`);
    const deployer = new ContractDeployer(abi, aztecRpcServer);
    const tx = deployer.deploy().send();

    await tx.isMined(0, 0.1);

    const receipt = await tx.getReceipt();
    const contract = new Contract(receipt.contractAddress!, abi, aztecRpcServer);
    logger('L2 contract deployed');
    return contract;
  };

  const addressToField = (address: AztecAddress): bigint => {
    return Fr.fromBuffer(address.toBuffer()).value;
  };

  /**
   * Milestone 3
   */
  it('should view transactions that perform nested calls', async () => {
    const parentContract = await deployContract(parentABI);
    const childContract = await deployContract(childABI);

    logger('Parent & Child contracts deployed');

    const result = await parentContract.methods
      .entryPoint(addressToField(childContract.address), Fr.fromBuffer(childContract.methods.value.selector).value)
      .view({ from: accounts[0] });

    expect(result[0]).toEqual(42n);
  }, 60_000);

  it('should mine transactions that perform nested calls', async () => {
    const parentContract = await deployContract(parentABI);
    const childContract = await deployContract(childABI);

    logger('Parent & Child contracts deployed');

    const tx = parentContract.methods
      .entryPoint(addressToField(childContract.address), Fr.fromBuffer(childContract.methods.value.selector).value)
      .send({ from: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
  }, 60_000);
});
