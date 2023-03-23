import { EthAddress } from '@aztec/ethereum.js/eth_address';
import { AccumulatedTxData, Tx } from '@aztec/p2p';
import { AztecNode } from './index.js';
import { WalletProvider } from '@aztec/ethereum.js/provider';
import { Rollup, Yeeter } from '@aztec/l1-contracts';

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

  it('should accept a transaction', async () => {
    const node = new AztecNode();
    await node.init(ETHEREUM_HOST, rollupAddress!, yeeterAddress!);
    const isReady = await node.isReady();
    expect(isReady).toBeTruthy();
    const tx: Tx = new Tx(AccumulatedTxData.random());
    await node.sendTx(tx);
    const txs = await node.getTxs();
    expect(txs.length).toBe(1);
    expect(txs[0].txId).toEqual(tx.txId);
  });
});
