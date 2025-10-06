import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { type AztecNode, DeployAccountMethod, Fr } from '@aztec/aztec.js';
import type { CheatCodes } from '@aztec/aztec/testing';
import { AmmBot, Bot, type BotConfig, BotStore, SupportedTokenContracts, getBotDefaultConfig } from '@aztec/bot';
import { AVM_MAX_PROCESSABLE_L2_GAS, MAX_PROCESSABLE_DA_GAS_PER_BLOCK } from '@aztec/constants';
import { SecretValue } from '@aztec/foundation/config';
import { bufferToHex } from '@aztec/foundation/string';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';

import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';

describe('e2e_bot', () => {
  let wallet: TestWallet;
  let aztecNode: AztecNode;
  let teardown: () => Promise<void>;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let cheatCodes: CheatCodes;
  let config: BotConfig;
  let l1RpcUrls: string[];

  beforeAll(async () => {
    const initialFundedAccounts = await getInitialTestAccountsData();
    const setupResult = await setup(1, { initialFundedAccounts });
    ({
      teardown,
      wallet,
      aztecNode,
      aztecNodeAdmin,
      cheatCodes,
      config: { l1RpcUrls },
    } = setupResult);
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
      bot = await Bot.create(config, wallet, aztecNode, undefined, new BotStore(await openTmpStore('bot')));
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

    it('reuses the same token contract', async () => {
      const { defaultAccountAddress, token } = bot;
      const bot2 = await Bot.create(config, wallet, aztecNode, undefined, new BotStore(await openTmpStore('bot')));
      expect(bot2.defaultAccountAddress.toString()).toEqual(defaultAccountAddress.toString());
      expect(bot2.token.address.toString()).toEqual(token.address.toString());
    });

    it('sends token from the bot using PrivateToken', async () => {
      const easyBot = await Bot.create(
        { ...config, contract: SupportedTokenContracts.PrivateTokenContract },
        wallet,
        aztecNode,
        undefined,
        new BotStore(await openTmpStore('bot')),
      );
      const { recipient: recipientBefore } = await easyBot.getBalances();

      await easyBot.run();
      const { recipient: recipientAfter } = await easyBot.getBalances();
      expect(recipientAfter.privateBalance - recipientBefore.privateBalance).toEqual(1n);
      expect(recipientAfter.publicBalance - recipientBefore.publicBalance).toEqual(0n);
    });
  });

  describe('bridge resume', () => {
    let store: BotStore;

    beforeAll(async () => {
      store = new BotStore(await openTmpStore('bot'));
    });

    afterAll(async () => {
      await store.close();
    });

    it('reuses prior bridge claims', async () => {
      using saveSpy = jest.spyOn(store, 'saveBridgeClaim');
      const config: BotConfig = {
        ...getBotDefaultConfig(),

        followChain: 'PENDING',
        ammTxs: false,

        // this bot has a well defined private key and salt
        senderPrivateKey: new SecretValue(Fr.fromString('0xcafe')),
        senderSalt: Fr.random(),

        l1RpcUrls,
        feePaymentMethod: 'fee_juice',
        // TODO: this should be taken from the `setup` call above
        l1Mnemonic: new SecretValue('test test test test test test test test test test test junk'),
        flushSetupTransactions: true,
      };

      {
        using deploy = jest.spyOn(DeployAccountMethod.prototype, 'send');

        deploy.mockImplementation(() => {
          throw new Error('test error');
        });

        await expect(Bot.create(config, wallet, aztecNode, aztecNodeAdmin, store)).rejects.toThrow('test error');
        expect(deploy).toHaveBeenCalledOnce();
        expect(saveSpy).toHaveBeenCalledOnce();
      }

      {
        saveSpy.mockClear();
        await expect(Bot.create(config, wallet, aztecNode, aztecNodeAdmin, store)).resolves.toBeDefined();
        expect(saveSpy).not.toHaveBeenCalled();
      }
    });

    it('does not reuse prior bridge claims if recipient address changes', async () => {
      using saveSpy = jest.spyOn(store, 'saveBridgeClaim');
      const config: BotConfig = {
        ...getBotDefaultConfig(),

        followChain: 'PENDING',
        ammTxs: false,

        // this bot has a well defined private key and salt
        senderPrivateKey: new SecretValue(Fr.fromString('0xcafe')),
        senderSalt: Fr.random(),

        l1RpcUrls,
        feePaymentMethod: 'fee_juice',
        // TODO: this should be taken from the `setup` call above
        l1Mnemonic: new SecretValue('test test test test test test test test test test test junk'),
        flushSetupTransactions: true,
      };

      {
        using deploy = jest.spyOn(DeployAccountMethod.prototype, 'send');
        deploy.mockImplementation(() => {
          throw new Error('test error');
        });
        await expect(Bot.create(config, wallet, aztecNode, aztecNodeAdmin, store)).rejects.toThrow('test error');
        expect(saveSpy).toHaveBeenCalledOnce();
      }
      {
        saveSpy.mockClear();

        // same private key, but different salt derives a different L2 address
        config.senderSalt = config.senderSalt!.add(Fr.ONE);
        await expect(Bot.create(config, wallet, aztecNode, aztecNodeAdmin, store)).resolves.toBeDefined();
        expect(saveSpy).toHaveBeenCalledOnce();
      }
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
      bot = await AmmBot.create(config, wallet, aztecNode, undefined, new BotStore(await openTmpStore('bot')));
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
        l1RpcUrls,
        flushSetupTransactions: true,
      };
    });

    // See 'can consume L1 to L2 message in %s after inbox drifts away from the rollup'
    // in end-to-end/src/e2e_cross_chain_messaging/l1_to_l2.test.ts for context on this test.
    it('creates bot after inbox drift', async () => {
      await cheatCodes.rollup.advanceInboxInProgress(10);
      await Bot.create(config, wallet, aztecNode, aztecNodeAdmin, new BotStore(await openTmpStore('bot')));
    }, 300_000);
  });
});
