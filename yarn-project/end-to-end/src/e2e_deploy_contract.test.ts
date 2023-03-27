import { AztecNode, AztecNodeConfig } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCClient, ContractDeployer, Fr } from '@aztec/aztec.js';
import { EthAddress } from '@aztec/ethereum.js/eth_address';
import { EthereumRpc } from '@aztec/ethereum.js/eth_rpc';
import { WalletProvider } from '@aztec/ethereum.js/provider';
import { createDebugLogger } from '@aztec/foundation';
import { TestContractAbi } from '@aztec/noir-contracts/examples';
import { createAztecRPCClient } from './create_aztec_rpc_client.js';
import { createProvider, deployRollupContract, deployYeeterContract } from './deploy_l1_contracts.js';

const ETHEREUM_HOST = 'http://localhost:8545';
const MNEMONIC = 'test test test test test test test test test test test junk';

const createAztecNode = async (
  rollupContract: EthAddress,
  yeeterContract: EthAddress,
  rpcUrl: string,
  publisherPrivateKey: Buffer,
) => {
  const config: AztecNodeConfig = {
    rollupContract,
    yeeterContract,
    rpcUrl,
    publisherPrivateKey,
    retryIntervalMs: 1000,
    requiredConfirmations: 1,
    transactionPollingInterval: 1000,
  };
  return await AztecNode.createAndSync(config);
};

const logger = createDebugLogger('aztec:e2e_test');

describe('e2e_deploy_contract', () => {
  let provider: WalletProvider;
  let node: AztecNode;
  let arc: AztecRPCClient;
  let rollupAddress: EthAddress;
  let yeeterAddress: EthAddress;
  let accounts: AztecAddress[];
  const abi = TestContractAbi;

  beforeAll(async () => {
    provider = createProvider(ETHEREUM_HOST, MNEMONIC, 1);
    const ethRpc = new EthereumRpc(provider);
    logger('deploying contracts...');
    rollupAddress = await deployRollupContract(provider, ethRpc);
    yeeterAddress = await deployYeeterContract(provider, ethRpc);
    logger('deployed contracts...');
  });

  beforeEach(async () => {
    node = await createAztecNode(rollupAddress, yeeterAddress, ETHEREUM_HOST, provider.getPrivateKey(0)!);
    arc = await createAztecRPCClient(1, node);
    accounts = await arc.getAccounts();
  });

  afterEach(async () => {
    await node.stop();
  });

  /**
   * Milestone 1.1
   * https://hackmd.io/ouVCnacHQRq2o1oRc5ksNA#Interfaces-and-Responsibilities
   */
  it('should deploy a contract', async () => {
    const deployer = new ContractDeployer(abi, arc);
    const tx = deployer.deploy().send();
    logger(`Tx sent!`);
    const receipt = await tx.getReceipt();
    logger(`Receipt received`);
    expect(receipt).toEqual(
      expect.objectContaining({
        from: accounts[0],
        to: undefined,
        status: true,
        error: '',
      }),
    );

    const contractAddress = receipt.contractAddress!;
    const constructor = abi.functions.find(f => f.name === 'constructor')!;
    const bytecode = await arc.getCode(contractAddress);
    expect(bytecode).toEqual(constructor.bytecode);
  }, 30_000);

  /**
   * Milestone 1.2
   * https://hackmd.io/-a5DjEfHTLaMBR49qy6QkA
   */
  it.skip('should not deploy a contract with the same salt twice', async () => {
    const contractAddressSalt = Fr.random();
    const deployer = new ContractDeployer(abi, arc, { contractAddressSalt });

    {
      const receipt = await deployer.deploy().send().getReceipt();
      expect(receipt.status).toBe(true);
      expect(receipt.error).toBe('');
    }

    {
      const receipt = await deployer.deploy().send().getReceipt();
      expect(receipt.status).toBe(false);
      expect(receipt.error).not.toBe('');
    }
  });
});
