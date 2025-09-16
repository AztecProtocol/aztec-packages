import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { Fr, type PXE } from '@aztec/aztec.js';
import { AmmBot, Bot, type BotConfig, SupportedTokenContracts, getBotDefaultConfig } from '@aztec/bot';
import { AVM_MAX_PROCESSABLE_L2_GAS, MAX_PROCESSABLE_DA_GAS_PER_BLOCK } from '@aztec/constants';
import { SecretValue } from '@aztec/foundation/config';
import { bufferToHex } from '@aztec/foundation/string';

import { type EndToEndContext, getPrivateKeyFromIndex, setup } from './fixtures/utils.js';

describe('e2e_bot', () => {
  let pxe: PXE;
  let teardown: () => Promise<void>;

  let config: BotConfig;
  let ctx: EndToEndContext;

  beforeAll(async () => {
    const initialFundedAccounts = await getInitialTestAccountsData();
    ctx = await setup(1, { initialFundedAccounts });
    ({ teardown, pxe } = ctx);
  });

  afterAll(() => teardown());

  describe('transaction-bot', () => {
    let bot: Bot;
    beforeAll(async () => {
      config = {
        ...getBotDefaultConfig(),
        followChain: 'PENDING',
        ammTxs: false,
      };
      bot = await Bot.create(config, { pxe });
    });

    it('sends token transfers from the bot', async () => {
      const { recipient: recipientBefore } = await bot.getBalances();

      await bot.run();
      const { recipient: recipientAfter } = await bot.getBalances();
      expect(recipientAfter.privateBalance - recipientBefore.privateBalance).toEqual(1n);
      expect(recipientAfter.publicBalance - recipientBefore.publicBalance).toEqual(1n);
    });

    it('sends token transfers with hardcoded gas and no simulation', async () => {
      bot.updateConfig({ daGasLimit: MAX_PROCESSABLE_DA_GAS_PER_BLOCK, l2GasLimit: AVM_MAX_PROCESSABLE_L2_GAS });
      const { recipient: recipientBefore } = await bot.getBalances();

      await bot.run();
      const { recipient: recipientAfter } = await bot.getBalances();
      expect(recipientAfter.privateBalance - recipientBefore.privateBalance).toEqual(1n);
      expect(recipientAfter.publicBalance - recipientBefore.publicBalance).toEqual(1n);
    });

    it('reuses the same account and token contract', async () => {
      const { defaultAccountAddress, token, recipient } = bot;
      const bot2 = await Bot.create(config, { pxe });
      expect(bot2.defaultAccountAddress.toString()).toEqual(defaultAccountAddress.toString());
      expect(bot2.token.address.toString()).toEqual(token.address.toString());
      expect(bot2.recipient.toString()).toEqual(recipient.toString());
    });

    it('sends token from the bot using PrivateToken', async () => {
      const easyBot = await Bot.create({ ...config, contract: SupportedTokenContracts.PrivateTokenContract }, { pxe });
      const { recipient: recipientBefore } = await easyBot.getBalances();

      await easyBot.run();
      const { recipient: recipientAfter } = await easyBot.getBalances();
      expect(recipientAfter.privateBalance - recipientBefore.privateBalance).toEqual(1n);
      expect(recipientAfter.publicBalance - recipientBefore.publicBalance).toEqual(0n);
    });
  });

  describe('amm-bot', () => {
    let bot: AmmBot;
    beforeAll(async () => {
      config = {
        ...getBotDefaultConfig(),
        followChain: 'PENDING',
        ammTxs: true,
      };
      bot = await AmmBot.create(config, { pxe });
    });

    it('swaps tokens from the bot', async () => {
      const balancesBefore = await bot.getBalances();
      await expect(bot.run()).resolves.toBeDefined();
      const balancesAfter = await bot.getBalances();

      // the bot swaps randomly
      // either we send token0 or token1
      expect(
        balancesAfter.senderPrivate.token0 < balancesBefore.senderPrivate.token0 ||
          balancesAfter.senderPrivate.token1 < balancesBefore.senderPrivate.token1,
      ).toBeTrue();

      // and get either token0 or token1
      expect(
        balancesAfter.senderPrivate.token0 > balancesBefore.senderPrivate.token0 ||
          balancesAfter.senderPrivate.token1 > balancesBefore.senderPrivate.token1,
      ).toBeTrue();
    });
  });

  describe('setup via bridging funds cross-chain', () => {
    beforeAll(() => {
      config = {
        ...getBotDefaultConfig(),
        followChain: 'PENDING',
        ammTxs: false,
        senderPrivateKey: new SecretValue(Fr.random()),
        l1PrivateKey: new SecretValue(bufferToHex(getPrivateKeyFromIndex(8)!)),
        l1RpcUrls: ctx.config.l1RpcUrls,
        flushSetupTransactions: true,
      };
    });

    // See 'can consume L1 to L2 message in %s after inbox drifts away from the rollup'
    // in end-to-end/src/e2e_cross_chain_messaging/l1_to_l2.test.ts for context on this test.
    it('creates bot after inbox drift', async () => {
      await ctx.cheatCodes.rollup.advanceInboxInProgress(10);
      await Bot.create(config, { pxe, node: ctx.aztecNode, nodeAdmin: ctx.aztecNodeAdmin });
    }, 300_000);
  });
});
