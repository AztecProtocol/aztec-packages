import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { TxReceipt } from '@aztec/aztec.js/tx';
import { Bot, type BotConfig, BotStore, getBotDefaultConfig } from '@aztec/bot';
import { MAX_TX_DA_GAS } from '@aztec/constants';
import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { SequencerClient } from '@aztec/sequencer-client';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { jest } from '@jest/globals';
import 'jest-extended';

import { PIPELINED_FEE_PADDING, PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { setup } from '../../fixtures/utils.js';

// Verifies sequencer runtime configuration (maxL2BlockGas / manaTarget) via a live Bot. Uses
// PIPELINING_SETUP_OPTS (prod sequencer, ethSlot=4s, aztecSlot=12s) with no accounts pre-deployed;
// the bot creates its own account inline.
describe('single-node/sequencer/sequencer_config', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let teardown: () => Promise<void>;
  let sequencer: SequencerClient | undefined;
  let config: BotConfig;
  let bot: Bot;
  let wallet: EmbeddedWallet;
  let aztecNode: AztecNode;
  let logger: Logger;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Suite exercising sequencer.updateConfig() at runtime to assert mana/gas limits are respected.
  describe('Sequencer config', () => {
    // Sane targets < 64 bits.
    const manaTarget = 200e6;
    beforeAll(async () => {
      const [botAccount] = await getInitialTestAccountsData();
      ({ teardown, sequencer, aztecNode, logger } = await setup(0, {
        ...PIPELINING_SETUP_OPTS,
        maxL2BlockGas: manaTarget * 2,
        manaTarget: BigInt(manaTarget),
        additionallyFundedAccounts: [botAccount],
      }));
      config = {
        ...getBotDefaultConfig(),
        followChain: 'CHECKPOINTED',
        botMode: 'transfer',
        txMinedWaitSeconds: 60,
        // Match pipelining fee padding so the bot's maxFeesPerGas keeps up with
        // fee-asset price evolution between PXE snapshot and inclusion.
        minFeePadding: PIPELINED_FEE_PADDING,
      };
      wallet = await EmbeddedWallet.create(aztecNode, { ephemeral: true });
      await wallet.createSchnorrInitializerlessAccount(botAccount.secret, botAccount.salt, botAccount.signingKey);
      bot = await Bot.create(config, wallet, aztecNode, undefined, new BotStore(await openTmpStore('bot')));
    });

    afterAll(() => teardown());

    // Asserts that the sequencer client's maxL2BlockGas property reflects the value passed to setup().
    it('properly sets config', () => {
      if (!sequencer) {
        throw new Error('Sequencer not found');
      }
      expect(sequencer.maxL2BlockGas).toBe(manaTarget * 2);
    });

    // Runs a bot tx to measure actual mana used, then sets maxL2BlockGas to exactly that value
    // (success expected), then to that value minus one (Timeout awaiting isMined expected).
    it('respects maxL2BlockGas', async () => {
      sequencer!.updateConfig({
        maxTxsPerBlock: 1,
        minTxsPerBlock: 0,
      });

      // Run a tx to get the total mana used
      const receipt: TxReceipt = (await bot.run()) as TxReceipt;
      expect(receipt).toBeDefined();
      expect(receipt.hasExecutionSucceeded()).toBe(true);
      const block = await aztecNode.getBlock(receipt.blockNumber!);
      expect(block).toBeDefined();
      const totalManaUsed = block?.header.totalManaUsed!.toBigInt();

      logger.info(`Total mana used: ${totalManaUsed}`);
      expect(totalManaUsed).toBeGreaterThan(0n);
      bot.updateConfig({
        l2GasLimit: Number(totalManaUsed),
        daGasLimit: MAX_TX_DA_GAS,
      });

      // Set the maxL2BlockGas to the total mana used
      sequencer!.updateConfig({
        maxL2BlockGas: Number(totalManaUsed),
      });

      // Run a tx and expect it to succeed
      const receipt2: TxReceipt = (await bot.run()) as TxReceipt;
      expect(receipt2).toBeDefined();
      expect(receipt2.hasExecutionSucceeded()).toBe(true);

      const checkpointedBeforeLimitReduction = await aztecNode.getBlockNumber('checkpointed');

      // Set the maxL2BlockGas to the total mana used - 1
      sequencer!.updateConfig({
        maxL2BlockGas: Number(totalManaUsed) - 1,
      });

      await retryUntil(
        async () => (await aztecNode.getBlockNumber('checkpointed')) > checkpointedBeforeLimitReduction,
        'checkpoint after lowering maxL2BlockGas',
        PIPELINING_SETUP_OPTS.aztecSlotDuration * 4,
      );

      // Try to run a tx and expect it to fail
      await expect(bot.run()).rejects.toThrow(/Timeout awaiting isMined/);
    });
  });
});
