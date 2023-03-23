import {
  AccumulatedData, AffineElement, AggregationObject, ConstantData, ContractDeploymentData, EMITTED_EVENTS_LENGTH, EthAddress as CircuitEthAddress, Fq, Fr, FunctionData, KERNEL_L1_MSG_STACK_LENGTH,
  KERNEL_NEW_COMMITMENTS_LENGTH, KERNEL_NEW_CONTRACTS_LENGTH, KERNEL_NEW_NULLIFIERS_LENGTH, KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH, KERNEL_PRIVATE_CALL_STACK_LENGTH,
  KERNEL_PUBLIC_CALL_STACK_LENGTH, NewContractData, OldTreeRoots, OptionallyRevealedData, PrivateKernelPublicInputs, TxContext
} from '@aztec/circuits.js';
import { EthAddress } from '@aztec/ethereum.js/eth_address';
import { EthereumRpc } from '@aztec/ethereum.js/eth_rpc';
import { WalletProvider } from '@aztec/ethereum.js/provider';
import { randomBytes, sleep } from '@aztec/foundation';
import { Rollup, Yeeter } from '@aztec/l1-contracts';
import { Tx } from '@aztec/p2p';
import { AztecNode } from '../src/index.js';

const ETHEREUM_HOST = 'http://localhost:8545/';

// REFACTOR: Move deployment logic to l1-contracts package, and refactor it out of other integration tests (archiver, sequencer)
const deployRollupContract = async (provider: WalletProvider, ethRpc: EthereumRpc) => {
  const deployAccount = provider.getAccount(0);
  const contract = new Rollup(ethRpc, undefined, { from: deployAccount, gas: 1000000 });
  await contract.deploy().send().getReceipt();
  return contract.address;
};

const deployYeeterContract = async (provider: WalletProvider, ethRpc: EthereumRpc) => {
  const deployAccount = provider.getAccount(0);
  const contract = new Yeeter(ethRpc, undefined, { from: deployAccount, gas: 1000000 });
  await contract.deploy().send().getReceipt();
  return contract.address;
};

const createProvider = () => {
  const walletProvider = WalletProvider.fromHost(ETHEREUM_HOST);
  walletProvider.addAccountsFromMnemonic('test test test test test test test test test test test junk', 1);
  return walletProvider;
};

// REFACTOR: Use @aztec/circuit.js/factories where possible
const createCircuitEthAddress = () => {
  return new CircuitEthAddress(randomBytes(20));
};

const createRandomCommitments = (num: number) => {
  return Array(num)
    .fill(0)
    .map(() => new Fr(randomBytes(32)));
};

const createOptionallyRetrievedData = () => {
  const func = new FunctionData(0, true, true);
  return new OptionallyRevealedData(
    new Fr(0),
    func,
    createRandomCommitments(EMITTED_EVENTS_LENGTH),
    new Fr(0),
    createCircuitEthAddress(),
    true,
    true,
    true,
    true,
  );
};

const createOptionallyRetrievedDatas = (num: number) => {
  return Array(num)
    .fill(0)
    .map(() => createOptionallyRetrievedData());
};

const createNewContractData = () => {
  return new NewContractData(new Fr(randomBytes(32)), createCircuitEthAddress(), new Fr(randomBytes(32)));
};

const createNewContractDatas = (num: number) => {
  return Array(num)
    .fill(0)
    .map(() => createNewContractData());
};

const createTx = () => {
  const oldTreeRoots = new OldTreeRoots(new Fr(0), new Fr(0), new Fr(0), new Fr(0));
  const contractDeploymentData = new ContractDeploymentData(
    new Fr(randomBytes(32)),
    new Fr(randomBytes(32)),
    new Fr(randomBytes(32)),
    createCircuitEthAddress(),
  );
  const txContext = new TxContext(false, false, true, contractDeploymentData);
  const constantData = new ConstantData(oldTreeRoots, txContext);
  const aggregationObject = new AggregationObject(
    new AffineElement(new Fq(0), new Fq(0)),
    new AffineElement(new Fq(0), new Fq(0)),
    [],
    [],
    false,
  );
  const accumulatedData = new AccumulatedData(
    aggregationObject,
    new Fr(0),
    createRandomCommitments(KERNEL_NEW_COMMITMENTS_LENGTH),
    createRandomCommitments(KERNEL_NEW_NULLIFIERS_LENGTH),
    createRandomCommitments(KERNEL_PRIVATE_CALL_STACK_LENGTH),
    createRandomCommitments(KERNEL_PUBLIC_CALL_STACK_LENGTH),
    createRandomCommitments(KERNEL_L1_MSG_STACK_LENGTH),
    createNewContractDatas(KERNEL_NEW_CONTRACTS_LENGTH),
    createOptionallyRetrievedDatas(KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH),
  );
  const kernelInputs = new PrivateKernelPublicInputs(accumulatedData, constantData, true);
  return new Tx(kernelInputs);
};

describe('AztecNode', () => {
  let rollupAddress: EthAddress;
  let yeeterAddress: EthAddress;
  let node: AztecNode;
  let isReady: boolean;

  beforeEach(async () => {
    const provider = createProvider();
    const ethRpc = new EthereumRpc(provider);
    rollupAddress = await deployRollupContract(provider, ethRpc);
    yeeterAddress = await deployYeeterContract(provider, ethRpc);

    node = new AztecNode();
    await node.init(ETHEREUM_HOST, rollupAddress, yeeterAddress);
    isReady = await node.isReady();
  });

  it('should start and stop all services', async () => {
    expect(isReady).toBeTruthy();
    await node.stop();
  });

  it('should rollup a transaction', async () => {
    const tx: Tx = createTx();
    await node.sendTx(tx);
    
    const [settledBlock] = await waitForBlocks(1);
    
    expect(settledBlock.number).toBe(0);
    expect(settledBlock.newContracts.length).toBeGreaterThan(0);
    expect(settledBlock.newContracts[0]).toEqual(tx.data.end.newContracts[0].functionTreeRoot);
    
    await node.stop();
  });

  it('should rollup multiple transactions sent one right after the other', async () => {
    const txs: Tx[] = Array(3).fill(0).map(createTx);
    for (const tx of txs) await node.sendTx(tx);
    const blocks = await waitForBlocks(3);
    
    for (let i = 0; i < 3; i++) {
      const tx = txs[i], block = blocks[i];
      expect(block.number).toBe(i);
      expect(block.newContracts.length).toBeGreaterThan(0);
      // TODO: This assertion fails after the first block
      if (i === 0) expect(block.newContracts[0]).toEqual(tx.data.end.newContracts[0].functionTreeRoot);
    }
    
    await node.stop();
  }, 30_000 /* timeout in ms */);

  const waitForBlocks = async (take: number) => {
    while (true) {
      const blocks = await node.getBlocks(0, take);
      if (blocks.length < take) {
        await sleep(100);
        continue;
      }
      return blocks;
    }
  }
});
