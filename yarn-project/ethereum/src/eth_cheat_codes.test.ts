import { Blob } from '@aztec/blob-lib';
import { times, timesAsync } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';

import type { Anvil } from '@viem/anvil';
import { type Hex, encodeFunctionData, getContract } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from './client.js';
import { deployL1Contract } from './deploy_l1_contracts.js';
import { EthCheatCodes } from './eth_cheat_codes.js';
import { startAnvil } from './test/start_anvil.js';
import type { ExtendedViemWalletClient } from './types.js';

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

    cheatCodes = new EthCheatCodes([rpcUrl]);
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
});
