import { EthAddress } from '@aztec/ethereum.js/eth_address';
import { Tx } from '@aztec/p2p';
import { AztecNode } from './index.js';
import { WalletProvider } from '@aztec/ethereum.js/provider';
import { Rollup, Yeeter } from '@aztec/l1-contracts';
import {
  PrivateKernelPublicInputs,
  AccumulatedData,
  ConstantData,
  OldTreeRoots,
  Fr,
  TxContext,
  ContractDeploymentData,
  AggregationObject,
  AffineElement,
  Fq,
  NewContractData,
  KERNEL_L1_MSG_STACK_LENGTH,
  KERNEL_NEW_COMMITMENTS_LENGTH,
  KERNEL_NEW_NULLIFIERS_LENGTH,
  KERNEL_PRIVATE_CALL_STACK_LENGTH,
  KERNEL_PUBLIC_CALL_STACK_LENGTH,
  KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH,
  FunctionData,
  EMITTED_EVENTS_LENGTH,
  OptionallyRevealedData,
  KERNEL_NEW_CONTRACTS_LENGTH,
  EthAddress as CircuitEthAddress,
} from '@aztec/circuits.js';
import { randomBytes, sleep } from '@aztec/foundation';
import { L2Block } from '@aztec/archiver';

const ETHEREUM_HOST = 'http://localhost:8545/';

const deployRollupContract = async (provider: WalletProvider) => {
  // Deploy.
  const deployAccount = provider.getAccount(0);
  const contract = new Rollup(provider, undefined, { from: deployAccount, gas: 1000000 });
  await contract.deploy().send().getReceipt();
  return contract.address;
};

const deployYeeterContract = async (provider: WalletProvider) => {
  // Deploy.
  const deployAccount = provider.getAccount(0);
  const contract = new Yeeter(provider, undefined, { from: deployAccount, gas: 1000000 });
  await contract.deploy().send().getReceipt();
  return contract.address;
};

const createProvider = () => {
  const walletProvider = WalletProvider.fromHost(ETHEREUM_HOST);
  walletProvider.addAccountsFromMnemonic('test test test test test test test test test test test junk', 1);
  return walletProvider;
};

const createCircuitEthAddress = () => {
  return new CircuitEthAddress(randomBytes(20));
};

const createRandomCommitments = (num: number) => {
  return Array(num)
    .fill(0)
    .map(_ => new Fr(randomBytes(32)));
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
    .map(_ => createOptionallyRetrievedData());
};

const createNewContractData = () => {
  return new NewContractData(new Fr(randomBytes(32)), createCircuitEthAddress(), new Fr(randomBytes(32)));
};

const createNewContractDatas = (num: number) => {
  return Array(num)
    .fill(0)
    .map(_ => createNewContractData());
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
  let rollupAddress: EthAddress | undefined = undefined;
  let yeeterAddress: EthAddress | undefined = undefined;
  beforeAll(async () => {
    const provider = createProvider();
    rollupAddress = await deployRollupContract(provider);
    yeeterAddress = await deployYeeterContract(provider);
  });
  it('should start and stop all services', async () => {
    const node = new AztecNode();
    await node.init(ETHEREUM_HOST, rollupAddress!, yeeterAddress!);
    const isReady = await node.isReady();
    expect(isReady).toBeTruthy();
    await node.stop();
  });

  it('should rollup a transaction', async () => {
    const node = new AztecNode();
    await node.init(ETHEREUM_HOST, rollupAddress!, yeeterAddress!);
    const isReady = await node.isReady();
    expect(isReady).toBeTruthy();
    const tx: Tx = createTx();
    await node.sendTx(tx);
    let settledBlock: L2Block | undefined = undefined;
    while (true) {
      const blocks = await node.getBlocks(0, 1);
      if (!blocks.length) {
        await sleep(100);
        continue;
      }
      settledBlock = blocks[0];
      break;
    }
    expect(settledBlock.number).toBe(1);
    expect(settledBlock.newContracts.length).toBeTruthy();
    expect(settledBlock.newContracts[0]).toEqual(tx.txData.newContracts[0].functionTreeRoot);
  });
});
