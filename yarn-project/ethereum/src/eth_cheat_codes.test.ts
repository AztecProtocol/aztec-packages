import { times, timesAsync } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';

import type { Anvil } from '@viem/anvil';
import {
  type Hex,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  fallback,
  getContract,
  http,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { deployL1Contract } from './deploy_l1_contracts.js';
import { EthCheatCodes } from './eth_cheat_codes.js';
import { startAnvil } from './test/start_anvil.js';
import type { SimpleViemWalletClient, ViemPublicClient } from './types.js';

const MNEMONIC = 'test test test test test test test test test test test junk';

describe('EthCheatCodes', () => {
  let walletClient: SimpleViemWalletClient;
  let publicClient: ViemPublicClient;
  let anvil: Anvil;
  let cheatCodes: EthCheatCodes;
  let logger: Logger;
  let sender: Hex;

  beforeAll(async () => {
    const { anvil: anvilInstance, rpcUrl } = await startAnvil();
    logger = createLogger('ethereum:test:eth_cheat_codes');
    anvil = anvilInstance;
    cheatCodes = new EthCheatCodes([rpcUrl]);

    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const privKeyRaw = hdAccount.getHdKey().privateKey!;
    const privKey = Buffer.from(privKeyRaw).toString('hex');
    const account = privateKeyToAccount(`0x${privKey}`);

    publicClient = createPublicClient({ transport: fallback([http(rpcUrl)]), chain: foundry });
    walletClient = createWalletClient({ transport: fallback([http(rpcUrl)]), chain: foundry, account });
    sender = account.address;
  });

  afterAll(async () => {
    await cheatCodes?.setIntervalMining(0); // Disable interval mining
    await anvil?.stop().catch(err => logger?.error(err));
  }, 5_000);

  describe('reorgs', () => {
    const deployToken = async () => {
      const { address, txHash } = await deployL1Contract(walletClient, publicClient, TestERC20Abi, TestERC20Bytecode, [
        'Test Token',
        'TEST',
        sender,
      ]);
      await publicClient.waitForTransactionReceipt({ hash: txHash! });
      return getContract({ address: address.toString(), abi: TestERC20Abi, client: walletClient });
    };

    const mint = async (token: Awaited<ReturnType<typeof deployToken>>, amount: bigint) => {
      const hash = await token.write.mint([sender, amount]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).toEqual('success');
    };

    const getEvents = (token: Awaited<ReturnType<typeof deployToken>>) =>
      publicClient.getContractEvents({
        address: token.address,
        abi: TestERC20Abi,
        eventName: 'Transfer',
        fromBlock: 1n,
        toBlock: 'latest',
      });

    it('reorgs back to before deployment', async () => {
      const token = await deployToken();
      await expect(token.read.name()).resolves.toEqual('Test Token');
      const blockNumberBefore = await publicClient.getBlockNumber();
      await cheatCodes.reorg(1);
      await expect(token.read.name()).rejects.toThrow(/returned no data/);
      await expect(publicClient.getBlockNumber({ cacheTime: 0 })).resolves.toEqual(blockNumberBefore - 1n);
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
      const token = await deployToken();
      await timesAsync(4, () => mint(token, 100n));

      await expect(token.read.balanceOf([sender])).resolves.toEqual(400n);
      await expect(getEvents(token)).resolves.toHaveLength(4);

      const blockNumberBefore = await publicClient.getBlockNumber();
      await cheatCodes.reorg(3);
      await expect(token.read.balanceOf([sender])).resolves.toEqual(100n);
      await expect(getEvents(token)).resolves.toHaveLength(1);
      await expect(publicClient.getBlockNumber({ cacheTime: 0 })).resolves.toEqual(blockNumberBefore - 3n);
    });

    it('reorgs with new empty blocks as replacement', async () => {
      const token = await deployToken();
      await timesAsync(4, () => mint(token, 100n));

      await expect(token.read.balanceOf([sender])).resolves.toEqual(400n);
      await expect(getEvents(token)).resolves.toHaveLength(4);

      const blockNumberBefore = await publicClient.getBlockNumber();
      await cheatCodes.reorgWithReplacement(3);
      await expect(token.read.balanceOf([sender])).resolves.toEqual(100n);
      await expect(getEvents(token)).resolves.toHaveLength(1);
      await expect(publicClient.getBlockNumber({ cacheTime: 0 })).resolves.toBeGreaterThanOrEqual(blockNumberBefore);
    });

    it('reorgs with blocks with replacement txs', async () => {
      const token = await deployToken();
      await timesAsync(4, () => mint(token, 100n));

      await expect(token.read.balanceOf([sender])).resolves.toEqual(400n);
      await expect(getEvents(token)).resolves.toHaveLength(4);

      const data = encodeFunctionData({ abi: TestERC20Abi, functionName: 'mint', args: [sender, 1000n] });
      const newTx = { data, to: token.address, from: sender, value: 0n };

      const blockNumber = await publicClient.getBlockNumber();
      await cheatCodes.reorgWithReplacement(3, [[newTx, newTx, newTx], [], [newTx]]);
      await expect(token.read.balanceOf([sender])).resolves.toEqual(4100n);
      await expect(getEvents(token)).resolves.toHaveLength(5);
      await expect(publicClient.getBlockNumber({ cacheTime: 0 })).resolves.toBeGreaterThanOrEqual(blockNumber);

      await expect(
        Promise.all(
          times(3, i =>
            publicClient
              .getBlock({ blockNumber: blockNumber - 2n + BigInt(i) })
              .then(block => block.transactions.length),
          ),
        ),
      ).resolves.toEqual([3, 0, 1]);
    });
  });
});
