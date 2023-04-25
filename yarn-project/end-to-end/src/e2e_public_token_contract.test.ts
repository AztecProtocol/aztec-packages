import { AztecNode, getConfigEnvVars } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, Contract, ContractDeployer, TxStatus } from '@aztec/aztec.js';
import { EthereumRpc } from '@aztec/ethereum.js/eth_rpc';
import { WalletProvider } from '@aztec/ethereum.js/provider';
import { EthAddress, Fr, Point, createDebugLogger, toBigIntBE } from '@aztec/foundation';
import { PublicTokenContractAbi } from '@aztec/noir-contracts/examples';

import { createAztecRpcServer } from './create_aztec_rpc_client.js';
import { createProvider, deployRollupContract, deployUnverifiedDataEmitterContract } from './deploy_l1_contracts.js';
import { pedersenCompressInputs } from '@aztec/barretenberg.js/crypto';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';

const MNEMONIC = 'test test test test test test test test test test test junk';

const logger = createDebugLogger('aztec:e2e_public_token_contract');

const config = getConfigEnvVars();

describe('e2e_public_token_contract', () => {
  let provider: WalletProvider;
  let node: AztecNode;
  let aztecRpcServer: AztecRPCServer;
  let rollupAddress: EthAddress;
  let unverifiedDataEmitterAddress: EthAddress;
  let accounts: AztecAddress[];
  let contract: Contract;

  const pointToPublicKey = (point: Point) => {
    const x = point.buffer.subarray(0, 32);
    const y = point.buffer.subarray(32, 64);
    return {
      x: toBigIntBE(x),
      y: toBigIntBE(y),
    };
  };

  const deployContract = async (initialBalance = 0n, owner = { x: 0n, y: 0n }) => {
    logger(`Deploying L2 contract...`);
    const deployer = new ContractDeployer(PublicTokenContractAbi, aztecRpcServer);
    const tx = deployer.deploy(initialBalance, owner).send();
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, PublicTokenContractAbi, aztecRpcServer);
    await tx.isMined(0, 0.1);
    await tx.getReceipt();
    logger('L2 contract deployed');
    return contract;
  };

  const calculateStorageSlot = async (accountIdx: number): Promise<bigint> => {
    const ownerPublicKey = await aztecRpcServer.getAccountPublicKey(accounts[accountIdx]);
    const xCoordinate = Fr.fromBuffer(ownerPublicKey.buffer.subarray(0, 32));
    const bbWasm = await BarretenbergWasm.get();
    const balancesStorageSlot = new Fr(1n); // this value is manually set in the Noir contract

    // Based on `at` function in
    // aztec3-packages/yarn-project/noir-contracts/src/contracts/noir-aztec3/src/state_vars/storage_map.nr
    const storageSlot = Fr.fromBuffer(
      pedersenCompressInputs(
        bbWasm,
        [balancesStorageSlot, xCoordinate].map(f => f.toBuffer()),
      ),
    );

    return storageSlot.value;
  };

  const expectStorageSlot = async (accountIdx: number, expectedBalance: bigint) => {
    const storageSlot = await calculateStorageSlot(accountIdx);
    const storageValue = await node.getStorageAt(contract.address!, storageSlot);
    if (storageValue === undefined) {
      throw new Error(`Storage slot ${storageSlot} not found`);
    }

    const balance = toBigIntBE(storageValue);

    logger(`Account ${accountIdx} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  beforeAll(() => {
    provider = createProvider(config.rpcUrl, MNEMONIC, 1);
    config.publisherPrivateKey = provider.getPrivateKey(0) || Buffer.alloc(32);
  });

  beforeEach(async () => {
    const ethRpc = new EthereumRpc(provider);
    logger('Deploying contracts...');
    rollupAddress = await deployRollupContract(provider, ethRpc);
    unverifiedDataEmitterAddress = await deployUnverifiedDataEmitterContract(provider, ethRpc);

    config.rollupContract = rollupAddress;
    config.unverifiedDataEmitterContract = unverifiedDataEmitterAddress;

    logger('Deployed contracts...');
    node = await AztecNode.createAndSync(config);
    aztecRpcServer = await createAztecRpcServer(2, node);
    accounts = await aztecRpcServer.getAccounts();
  });

  afterEach(async () => {
    await node.stop();
    await aztecRpcServer.stop();
  });

  it('should deploy a public token contract', async () => {
    await deployContract();
  }, 30_000);

  it.only('should deploy a public token contract and mint tokens to a recipient', async () => {
    const mintAmount = 359n;

    const recipientIdx = 0;

    const recipient = accounts[recipientIdx];
    const deployedContract = await deployContract();

    const tx = deployedContract.methods
      .mint(mintAmount, pointToPublicKey(await aztecRpcServer.getAccountPublicKey(recipient)))
      .send({ from: recipient });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);

    await expectStorageSlot(recipientIdx, mintAmount);
  }, 30_000);
});
