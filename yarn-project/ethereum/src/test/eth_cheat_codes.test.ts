import { Blob } from '@aztec/blob-lib';
import { times, timesAsync } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, TestDateProvider } from '@aztec/foundation/timer';
import { getErrorCause } from '@aztec/foundation/types';
import { TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';

import { type Hex, RpcRequestError, encodeFunctionData, getContract, parseEther } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from '../client.js';
import { deployL1Contract } from '../deploy_l1_contract.js';
import type { ExtendedViemWalletClient } from '../types.js';
import { EthCheatCodes } from './eth_cheat_codes.js';
import type { Anvil } from './start_anvil.js';
import { startAnvil } from './start_anvil.js';

const MNEMONIC = 'test test test test test test test test test test test junk';
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL;

describe('EthCheatCodes', () => {
  let l1Client: ExtendedViemWalletClient;
  let anvil: Anvil | undefined;
  let rpcUrl: string;
  let cheatCodes: EthCheatCodes;
  let logger: Logger;
  let sender: Hex;

  beforeEach(async () => {
    if (ANVIL_RPC_URL) {
      rpcUrl = ANVIL_RPC_URL;
    } else {
      ({ anvil, rpcUrl } = await startAnvil());
    }

    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());
    logger = createLogger('ethereum:test:eth_cheat_codes');

    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const privKeyRaw = hdAccount.getHdKey().privateKey!;
    const privKey = Buffer.from(privKeyRaw).toString('hex');
    const account = privateKeyToAccount(`0x${privKey}`);

    l1Client = createExtendedL1Client([rpcUrl], account, foundry);
    sender = account.address;
  });

  afterEach(async () => {
    await cheatCodes?.setIntervalMining(0); // Disable interval mining
    await anvil?.stop().catch(err => logger?.error(err));
  }, 5_000);

  describe('reorgs', () => {
    const deployToken = async () => {
      logger.warn(`Deploying token contract`);
      const { address, txHash } = await deployL1Contract(l1Client, TestERC20Abi, TestERC20Bytecode, [
        'Test Token',
        'TEST',
        sender,
      ]);
      await l1Client.waitForTransactionReceipt({ hash: txHash! });
      return getContract({ address: address.toString(), abi: TestERC20Abi, client: l1Client });
    };

    const mint = async (token: Awaited<ReturnType<typeof deployToken>>, amount: bigint) => {
      const hash = await token.write.mint([sender, amount]);
      const receipt = await l1Client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toEqual('success');
    };

    const getEvents = (token: Awaited<ReturnType<typeof deployToken>>) =>
      l1Client.getContractEvents({
        address: token.address,
        abi: TestERC20Abi,
        eventName: 'Transfer',
        fromBlock: 1n,
        toBlock: 'latest',
      });

    const getBlockNumber = () => l1Client.getBlockNumber({ cacheTime: 0 });
    const getTimestamp = () => l1Client.getBlock().then(block => block.timestamp);

    it('reorgs back to before deployment', async () => {
      const token = await deployToken();
      await expect(token.read.name()).resolves.toEqual('Test Token');
      await cheatCodes.reorg(1);
      await expect(token.read.name()).rejects.toThrow(/returned no data/);
    });

    it('rollbacks events and state on reorg', async () => {
      const token = await deployToken();
      await mint(token, 100n);
      await expect(token.read.balanceOf([sender])).resolves.toEqual(100n);
      await expect(getEvents(token)).resolves.toHaveLength(1);

      await cheatCodes.reorg(1);
      await expect(token.read.balanceOf([sender])).resolves.toEqual(0n);
      await expect(getEvents(token)).resolves.toHaveLength(0);
    });

    it('reorgs multiple blocks', async () => {
      await cheatCodes.setBlockInterval(1000);
      const token = await deployToken();
      const timestampDeployment = await getTimestamp();

      await timesAsync(4, () => mint(token, 100n));

      await expect(token.read.balanceOf([sender])).resolves.toEqual(400n);
      await expect(getEvents(token)).resolves.toHaveLength(4);

      const blockNumberBeforeReorg = await getBlockNumber();
      const timestampBeforeReorg = await getTimestamp();
      expect(timestampBeforeReorg).toBeGreaterThan(timestampDeployment);

      await cheatCodes.reorg(3);
      await expect(token.read.balanceOf([sender])).resolves.toEqual(100n);
      await expect(getEvents(token)).resolves.toHaveLength(1);
      await expect(getBlockNumber()).resolves.toBeLessThan(blockNumberBeforeReorg);

      const timestampAfterReorg = await getTimestamp();
      expect(timestampAfterReorg).toBeLessThan(timestampBeforeReorg);
      expect(timestampAfterReorg).toBeGreaterThan(timestampDeployment);
    });

    it('reorgs with new empty blocks as replacement', async () => {
      const token = await deployToken();
      await timesAsync(4, () => mint(token, 100n));

      await expect(token.read.balanceOf([sender])).resolves.toEqual(400n);
      await expect(getEvents(token)).resolves.toHaveLength(4);

      const blockNumberBefore = await getBlockNumber();
      await cheatCodes.reorgWithReplacement(3);
      await expect(token.read.balanceOf([sender])).resolves.toEqual(100n);
      await expect(getEvents(token)).resolves.toHaveLength(1);
      await expect(getBlockNumber()).resolves.toBeGreaterThanOrEqual(blockNumberBefore);
    });

    it('reorgs with blocks with replacement tx requests', async () => {
      const token = await deployToken();
      await timesAsync(4, () => mint(token, 100n));

      await expect(token.read.balanceOf([sender])).resolves.toEqual(400n);
      await expect(getEvents(token)).resolves.toHaveLength(4);

      const data = encodeFunctionData({ abi: TestERC20Abi, functionName: 'mint', args: [sender, 1000n] });
      const newTx = { data, to: token.address, from: sender, value: 0n };

      const blockNumber = await getBlockNumber();
      await cheatCodes.reorgWithReplacement(3, [[newTx, newTx, newTx], [], [newTx]]);
      await expect(token.read.balanceOf([sender])).resolves.toEqual(4100n);
      await expect(getEvents(token)).resolves.toHaveLength(5);
      await expect(getBlockNumber()).resolves.toBeGreaterThanOrEqual(blockNumber);

      await expect(
        Promise.all(
          times(3, i =>
            l1Client.getBlock({ blockNumber: blockNumber - 2n + BigInt(i) }).then(block => block.transactions.length),
          ),
        ),
      ).resolves.toEqual([3, 0, 1]);
    });

    it('reorgs with blocks with serialized replacement txs', async () => {
      const token = await deployToken();
      const initialNonce = await l1Client.getTransactionCount({ address: sender });
      await timesAsync(4, () => mint(token, 100n));

      await expect(token.read.balanceOf([sender])).resolves.toEqual(400n);
      await expect(getEvents(token)).resolves.toHaveLength(4);

      const data = encodeFunctionData({ abi: TestERC20Abi, functionName: 'mint', args: [sender, 1000n] });
      const newTx = { data, to: token.address, from: sender, value: 0n, gas: 1_000_000n };
      const txs = await timesAsync(4, async i =>
        l1Client.signTransaction(await l1Client.prepareTransactionRequest({ ...newTx, nonce: initialNonce + 1 + i })),
      );

      const blockNumber = await getBlockNumber();
      await cheatCodes.reorgWithReplacement(3, [txs.slice(0, 3), [], txs.slice(3, 4)]);
      await expect(token.read.balanceOf([sender])).resolves.toEqual(4100n);
      await expect(getEvents(token)).resolves.toHaveLength(5);
      await expect(getBlockNumber()).resolves.toBeGreaterThanOrEqual(blockNumber);

      await expect(
        Promise.all(
          times(3, i =>
            l1Client.getBlock({ blockNumber: blockNumber - 2n + BigInt(i) }).then(block => block.transactions.length),
          ),
        ),
      ).resolves.toEqual([3, 0, 1]);
    });

    it('reorgs with blocks with replacement txs with blobs', async () => {
      await cheatCodes.mine(5);

      const blobs = [new Uint8Array(131072).fill(1)];
      const kzg = Blob.getViemKzgInstance();
      const maxFeePerBlobGas = BigInt(1e10);
      const txRequest = { to: sender, blobs, kzg, maxFeePerBlobGas };
      const signed = await l1Client.signTransaction(await l1Client.prepareTransactionRequest(txRequest));

      await cheatCodes.reorgWithReplacement(3, [[signed], [], []]);
      const blockNumber = await getBlockNumber();
      const block = await l1Client.getBlock({ blockNumber: blockNumber - 2n, includeTransactions: true });
      const [tx] = block.transactions;
      const txReceipt = await l1Client.getTransactionReceipt({ hash: tx.hash });

      expect(txReceipt.status).toEqual('success');
      expect(tx.blobVersionedHashes?.length).toBeGreaterThan(0);
      expect(tx.maxFeePerBlobGas).toBeGreaterThan(0);
    });
  });

  describe('mineEmptyBlock', () => {
    it('mines an empty block while preserving pending transactions', async () => {
      // Deploy a token first (with automine enabled)
      const { address, txHash } = await deployL1Contract(l1Client, TestERC20Abi, TestERC20Bytecode, [
        'Test Token',
        'TEST',
        sender,
      ]);
      await l1Client.waitForTransactionReceipt({ hash: txHash! });
      const token = getContract({ address: address.toString(), abi: TestERC20Abi, client: l1Client });

      // Now disable automine so we can have pending transactions
      await cheatCodes.setAutomine(false);

      // Get initial block number
      const blockNumberBefore = await l1Client.getBlockNumber({ cacheTime: 0 });

      // Send a transaction that will remain pending
      const mintHash = await token.write.mint([sender, 100n]);
      await sleep(100);

      // Verify transaction is pending in the mempool
      expect(await l1Client.getTransaction({ hash: mintHash }).then(t => t.hash)).toEqual(mintHash);
      await expect(l1Client.getTransactionReceipt({ hash: mintHash })).rejects.toThrow();

      // Mine an empty block
      await cheatCodes.mineEmptyBlock();

      // Verify block number increased
      const blockNumberAfter = await l1Client.getBlockNumber({ cacheTime: 0 });
      expect(blockNumberAfter).toBe(blockNumberBefore + 1n);

      // Verify the mined block is empty (no transactions)
      const block = await l1Client.getBlock({ blockNumber: blockNumberAfter });
      expect(block.transactions.length).toBe(0);

      // Verify the pending transaction is still pending (can be mined later)
      await expect(l1Client.getTransactionReceipt({ hash: mintHash })).rejects.toThrow();

      // Mine another block to confirm the transaction is still in the pool
      await cheatCodes.mine(1);
      const receipt = await l1Client.getTransactionReceipt({ hash: mintHash });
      expect(receipt.status).toBe('success');
      expect(receipt.blockNumber).toBe(blockNumberAfter + 1n);

      // Verify the mint worked
      await expect(token.read.balanceOf([sender])).resolves.toEqual(100n);
    });
  });

  describe('mine', () => {
    it(`mine block`, async () => {
      const blockNumber = await cheatCodes.blockNumber();
      await cheatCodes.mine();
      expect(await cheatCodes.blockNumber()).toBe(blockNumber + 1);
    });

    it.each([10, 42, 99])(`mine %i blocks`, async increment => {
      const blockNumber = await cheatCodes.blockNumber();
      await cheatCodes.mine(increment);
      expect(await cheatCodes.blockNumber()).toBe(blockNumber + increment);
    });
  });

  describe('startIntervalMiningWithFreshBlock', () => {
    const expectAutoBlockAfter = async (blockNumber: number) => {
      for (let i = 0; i < 20; i++) {
        await sleep(100);
        if ((await cheatCodes.blockNumber()) > blockNumber) {
          return;
        }
      }
      expect(await cheatCodes.blockNumber()).toBeGreaterThan(blockNumber);
    };

    it('starts interval mining from a freshly mined block and syncs the date provider', async () => {
      const interval = 1;
      const dateProvider = new TestDateProvider();
      cheatCodes = new EthCheatCodes([rpcUrl], dateProvider);

      const blockNumber = await cheatCodes.blockNumber();
      const timestamp = await cheatCodes.lastBlockTimestamp();

      await sleep((interval + 1) * 1000);
      await cheatCodes.startIntervalMiningWithFreshBlock(interval);

      const minedBlockNumber = await cheatCodes.blockNumber();
      const minedTimestamp = await cheatCodes.lastBlockTimestamp();

      expect(minedBlockNumber).toBe(blockNumber + 1);
      expect(minedTimestamp).toBeGreaterThan(timestamp);
      expect(await cheatCodes.isAutoMining()).toBe(false);
      expect(await cheatCodes.getIntervalMining()).toBe(interval);
      expect(Math.abs(dateProvider.now() - minedTimestamp * 1000)).toBeLessThan(1_000);
      await expectAutoBlockAfter(minedBlockNumber);
    });
  });

  it.each([100, 42, 99])(`setNextBlockTimestamp by %i`, async increment => {
    const blockNumber = await cheatCodes.blockNumber();
    const timestamp = await cheatCodes.lastBlockTimestamp();
    await cheatCodes.setNextBlockTimestamp(timestamp + increment);

    expect(await cheatCodes.lastBlockTimestamp()).toBe(timestamp);

    await cheatCodes.mine();

    expect(await cheatCodes.blockNumber()).toBe(blockNumber + 1);
    expect(await cheatCodes.lastBlockTimestamp()).toBe(timestamp + increment);
  });

  it('setNextBlockTimestamp to a past timestamp throws', async () => {
    const timestamp = await cheatCodes.lastBlockTimestamp();
    const pastTimestamp = timestamp - 1000;
    await expect(async () => await cheatCodes.setNextBlockTimestamp(pastTimestamp)).rejects.toThrow('Timestamp error');
  });

  it('load a value at a particular storage slot', async () => {
    // check that storage slot 0 is empty as expected
    const res = await cheatCodes.load(EthAddress.ZERO, 0n);
    expect(res).toBe(0n);
  });

  it.each(['1', 'bc40fbf4394cd00f78fae9763b0c2c71b21ea442c42fdadc5b720537240ebac1'])(
    'store a value at a given slot and its keccak value of the slot (if it were in a map) ',
    async storageSlotInHex => {
      const storageSlot = BigInt('0x' + storageSlotInHex);
      const valueToSet = 5n;
      const contractAddress = EthAddress.fromString('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
      await cheatCodes.store(contractAddress, storageSlot, valueToSet);
      expect(await cheatCodes.load(contractAddress, storageSlot)).toBe(valueToSet);
      // also test with the keccak value of the slot - can be used to compute storage slots of maps
      await cheatCodes.store(contractAddress, cheatCodes.keccak256(0n, storageSlot), valueToSet);
      expect(await cheatCodes.load(contractAddress, cheatCodes.keccak256(0n, storageSlot))).toBe(valueToSet);
    },
  );

  it('set bytecode correctly', async () => {
    const contractAddress = EthAddress.fromString('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    await cheatCodes.etch(contractAddress, '0x1234');
    expect(await cheatCodes.getBytecode(contractAddress)).toBe('0x1234');
  });

  it('impersonate', async () => {
    // we will transfer 1 eth to a random address. Then impersonate the address to be able to send funds
    // without impersonation we wouldn't be able to send funds.
    const myAddress = sender;
    const randomAddress = EthAddress.random().toString();
    const tx1Hash = await l1Client.sendTransaction({
      account: myAddress,
      to: randomAddress,
      value: parseEther('1'),
    });
    await l1Client.waitForTransactionReceipt({ hash: tx1Hash });
    const beforeBalance = await l1Client.getBalance({ address: randomAddress });

    // impersonate random address
    await cheatCodes.startImpersonating(EthAddress.fromString(randomAddress));
    // send funds from random address
    const amountToSend = parseEther('0.1');
    const tx2Hash = await l1Client.sendTransaction({
      account: randomAddress,
      to: myAddress,
      value: amountToSend,
    });
    const txReceipt = await l1Client.waitForTransactionReceipt({ hash: tx2Hash });
    const feePaid = txReceipt.gasUsed * txReceipt.effectiveGasPrice;
    expect(await l1Client.getBalance({ address: randomAddress })).toBe(beforeBalance - amountToSend - feePaid);

    // stop impersonating
    await cheatCodes.stopImpersonating(EthAddress.fromString(randomAddress));

    // making calls from random address should not be successful
    try {
      await l1Client.sendTransaction({
        account: randomAddress,
        to: myAddress,
        value: 0n,
      });
      // done with a try-catch because viem errors are noisy and we need to check just a small portion of the error.
      fail('should not be able to send funds from random address');
    } catch (e: unknown) {
      expect(getErrorCause(e, RpcRequestError)?.details).toContain('No Signer available');
    }
  });
});
