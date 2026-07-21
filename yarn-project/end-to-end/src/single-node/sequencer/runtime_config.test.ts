import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { TxReceipt } from '@aztec/aztec.js/tx';
import { Bot, type BotConfig, BotStore, getBotDefaultConfig } from '@aztec/bot';
import { MAX_TX_DA_GAS } from '@aztec/constants';
import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { SlasherClientInterface } from '@aztec/slasher';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { jest } from '@jest/globals';

import { PIPELINED_FEE_PADDING, PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { setupBlockProducer } from '../setup.js';
import type { SingleNodeTestContext } from '../single_node_test_context.js';

// Merges the former slasher_config and sequencer_config admin-API checks onto one production-sequencer
// node (setupBlockProducer, PIPELINING_SETUP_OPTS timing). The single setup carries both suites' config
// knobs: the slasher inactivity config (whose getters slasher config asserts) and the max L2 block gas /
// mana target (which sequencer config asserts and then lowers at runtime). No block building is needed
// for the slasher check; the sequencer check drives a live Bot to measure mana and enforce the limit.
describe('single-node/sequencer/runtime_config', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  // Sane targets < 64 bits.
  const manaTarget = 200e6;

  let test: SingleNodeTestContext;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let sequencer: SequencerClient | undefined;
  let logger: Logger;

  let config: BotConfig;
  let bot: Bot;
  let wallet: EmbeddedWallet;

  beforeAll(async () => {
    const [botAccount] = await getInitialTestAccountsData();
    test = await setupBlockProducer({
      ...PIPELINING_SETUP_OPTS,
      // slasher config knobs: seed the inactivity slashing config so its getters have known values.
      anvilSlotsInAnEpoch: 4,
      slashInactivityTargetPercentage: 1,
      slashInactivityPenalty: 42n,
      // sequencer config knobs: cap block gas so the getter/enforcement it can measure and lower it.
      maxL2BlockGas: manaTarget * 2,
      manaTarget: BigInt(manaTarget),
      additionallyFundedAccounts: [botAccount],
      // The bot follows the checkpointed tip; keep the PXE on the same tip (setupBlockProducer would
      // otherwise default to 'proposed').
      pxeOpts: { syncChainTip: 'checkpointed' },
    });
    ({ aztecNode, aztecNodeAdmin, sequencer, logger } = test.context);

    if (!aztecNodeAdmin) {
      throw new Error('Aztec node admin API must be available for this test');
    }

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

  afterAll(() => test.teardown());

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Tests that slasher configuration can be updated at runtime via the node admin API.
  describe('slasher config', () => {
    // Reads the initial slasher config from the running node's slasher client, calls setConfig() via
    // the admin API to update slashInactivityTargetPercentage, and asserts the new value is reflected
    // while slashInactivityPenalty remains unchanged.
    it('should update slasher config', async () => {
      const slasherClient = (aztecNode as TestAztecNodeService).slasherClient as SlasherClientInterface;
      expect(slasherClient).toBeDefined();
      const currentConfig = slasherClient.getConfig();
      expect(currentConfig.slashInactivityTargetPercentage).toBe(1);
      expect(currentConfig.slashInactivityPenalty).toBe(42n);
      await aztecNodeAdmin!.setConfig({ slashInactivityTargetPercentage: 0.9 });
      const updatedConfig = slasherClient.getConfig();
      expect(updatedConfig.slashInactivityTargetPercentage).toBe(0.9);
      expect(updatedConfig.slashInactivityPenalty).toBe(42n);
    });
  });

  // Suite exercising sequencer.updateConfig() at runtime to assert mana/gas limits are respected.
  describe('sequencer config', () => {
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
