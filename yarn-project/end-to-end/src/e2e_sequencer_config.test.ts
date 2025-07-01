import { getInitialTestAccounts } from '@aztec/accounts/testing';
import type { PXE, TxReceipt } from '@aztec/aztec.js';
import { Bot, type BotConfig, getBotDefaultConfig } from '@aztec/bot';
import type { Logger } from '@aztec/foundation/log';
import type { SequencerClient } from '@aztec/sequencer-client';

import { jest } from '@jest/globals';
import 'jest-extended';

import { setup } from './fixtures/utils.js';

describe('e2e_sequencer_config', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let teardown: () => Promise<void>;
  let sequencer: SequencerClient | undefined;
  let config: BotConfig;
  let bot: Bot;
  let pxe: PXE;
  let logger: Logger;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Sequencer config', () => {
    // Sane targets < 64 bits.
    const manaTarget = 21e10;
    beforeAll(async () => {
      const initialFundedAccounts = await getInitialTestAccounts();
      ({ teardown, sequencer, pxe, logger } = await setup(1, {
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
      bot = await Bot.create(config, { pxe });
    });

    afterAll(() => teardown());

    it('properly sets config', () => {
      if (!sequencer) {
        throw new Error('Sequencer not found');
      }
      expect(sequencer.maxL2BlockGas).toBe(manaTarget * 2);
    });

    it('respects maxL2BlockGas', async () => {
      sequencer!.updateSequencerConfig({
        maxTxsPerBlock: 1,
        minTxsPerBlock: 0,
      });
      sequencer!.flush();

      // Run a tx to get the total mana used
      const receipt: TxReceipt = (await bot.run()) as TxReceipt;
      expect(receipt).toBeDefined();
      expect(receipt.status).toBe('success');
      const block = await pxe.getBlock(receipt.blockNumber!);
      expect(block).toBeDefined();
      const totalManaUsed = block?.header.totalManaUsed!.toBigInt();

      logger.info(`Total mana used: ${totalManaUsed}`);
      expect(totalManaUsed).toBeGreaterThan(0n);
      bot.updateConfig({
        l2GasLimit: Number(totalManaUsed),
        daGasLimit: Number(totalManaUsed),
      });

      // Set the maxL2BlockGas to the total mana used
      sequencer!.updateSequencerConfig({
        maxL2BlockGas: Number(totalManaUsed),
      });

      // Flush the sequencer to make sure the new config is applied to the next tx
      sequencer!.flush();

      // Run a tx and expect it to succeed
      const receipt2: TxReceipt = (await bot.run()) as TxReceipt;
      expect(receipt2).toBeDefined();
      expect(receipt2.status).toBe('success');

      // Set the maxL2BlockGas to the total mana used - 1
      sequencer!.updateSequencerConfig({
        maxL2BlockGas: Number(totalManaUsed) - 1,
      });

      // Flush the sequencer to make sure the new config is applied to the next tx
      sequencer!.flush();

      // Try to run a tx and expect it to fail
      await expect(bot.run()).rejects.toThrow(/Timeout awaiting isMined/);
    });
  });
});
