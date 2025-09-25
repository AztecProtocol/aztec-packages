import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import type { AztecNode, TxReceipt } from '@aztec/aztec.js';
import { Bot, type BotConfig, BotStore, getBotDefaultConfig } from '@aztec/bot';
import type { Logger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import 'jest-extended';

import { setup } from './fixtures/utils.js';

describe('e2e_sequencer_config', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let teardown: () => Promise<void>;
  let sequencer: SequencerClient | undefined;
  let config: BotConfig;
  let bot: Bot;
  let wallet: TestWallet;
  let aztecNode: AztecNode;
  let logger: Logger;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Sequencer config', () => {
    // Sane targets < 64 bits.
    const manaTarget = 21e10;
    beforeAll(async () => {
      const initialFundedAccounts = await getInitialTestAccountsData();
      ({ teardown, sequencer, aztecNode, logger, wallet } = await setup(1, {
        maxL2BlockGas: manaTarget * 2,
        manaTarget: BigInt(manaTarget),
        initialFundedAccounts,
      }));
      config = {
        ...getBotDefaultConfig(),
        followChain: 'PENDING',
        ammTxs: false,
        txMinedWaitSeconds: 12,
      };
      bot = await Bot.create(config, wallet, aztecNode, undefined, new BotStore(await openTmpStore('bot')));
    });

    afterAll(() => teardown());

    it('properly sets config', () => {
      if (!sequencer) {
        throw new Error('Sequencer not found');
      }
      expect(sequencer.maxL2BlockGas).toBe(manaTarget * 2);
    });

    it('respects maxL2BlockGas', async () => {
      sequencer!.updateConfig({
        maxTxsPerBlock: 1,
        minTxsPerBlock: 0,
      });

      // Run a tx to get the total mana used
      const receipt: TxReceipt = (await bot.run()) as TxReceipt;
      expect(receipt).toBeDefined();
      expect(receipt.status).toBe('success');
      const block = await aztecNode.getBlock(receipt.blockNumber!);
      expect(block).toBeDefined();
      const totalManaUsed = block?.header.totalManaUsed!.toBigInt();

      logger.info(`Total mana used: ${totalManaUsed}`);
      expect(totalManaUsed).toBeGreaterThan(0n);
      bot.updateConfig({
        l2GasLimit: Number(totalManaUsed),
        daGasLimit: Number(totalManaUsed),
      });

      // Set the maxL2BlockGas to the total mana used
      sequencer!.updateConfig({
        maxL2BlockGas: Number(totalManaUsed),
      });

      // Run a tx and expect it to succeed
      const receipt2: TxReceipt = (await bot.run()) as TxReceipt;
      expect(receipt2).toBeDefined();
      expect(receipt2.status).toBe('success');

      // Set the maxL2BlockGas to the total mana used - 1
      sequencer!.updateConfig({
        maxL2BlockGas: Number(totalManaUsed) - 1,
      });

      // Try to run a tx and expect it to fail
      await expect(bot.run()).rejects.toThrow(/Timeout awaiting isMined/);
    });
  });
});
