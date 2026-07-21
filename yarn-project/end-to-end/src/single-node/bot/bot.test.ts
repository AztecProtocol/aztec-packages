import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { MinedTxReceipt, type TxReceipt } from '@aztec/aztec.js/tx';
import type { CheatCodes } from '@aztec/aztec/testing';
import {
  AmmBot,
  Bot,
  type BotConfig,
  BotStore,
  CrossChainBot,
  SupportedTokenContracts,
  getBotDefaultConfig,
} from '@aztec/bot';
import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';
import { SecretValue } from '@aztec/foundation/config';
import { bufferToHex } from '@aztec/foundation/string';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { jest } from '@jest/globals';

import { PIPELINED_FEE_PADDING, PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
<<<<<<< HEAD
=======
import { testSpan } from '../../fixtures/timing.js';
>>>>>>> origin/v5-next
import { getPrivateKeyFromIndex, setup } from '../../fixtures/utils.js';
import { NO_REORG_SUBMISSION_EPOCHS } from '../setup.js';

// Tests the transaction bot implementations (transfer bot, AMM bot, cross-chain bot).
// Uses setup(0, PIPELINING_SETUP_OPTS + aztecProofSubmissionEpochs:NO_REORG_SUBMISSION_EPOCHS) with one node, production
// sequencer (ethereumSlotDuration=4s, aztecSlotDuration=12s, proofSubEpochs=NO_REORG_SUBMISSION_EPOCHS, minTxsPerBlock=0;
// aztecEpochDuration is the setup() default). The bridge-resume, setup-via-bridging, and
// cross-chain-bot subsuites actively drive L1 cross-chain bridging: fee-juice portal deposits,
// advanceInboxInProgress, and L2→L1 messages via CrossChainBot.
describe('single-node/bot/bot', () => {
  let wallet: EmbeddedWallet;
  let aztecNode: AztecNode;
  let teardown: () => Promise<void>;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let cheatCodes: CheatCodes;
  let config: BotConfig;
  let l1RpcUrls: string[];

  beforeAll(async () => {
    const [botAccount] = await getInitialTestAccountsData();
    const setupResult = await setup(0, {
      ...PIPELINING_SETUP_OPTS,
      aztecProofSubmissionEpochs: NO_REORG_SUBMISSION_EPOCHS,
      additionallyFundedAccounts: [botAccount],
    });
    ({
      teardown,
      aztecNode,
      aztecNodeAdmin,
      cheatCodes,
      config: { l1RpcUrls },
    } = setupResult);
<<<<<<< HEAD
    wallet = await EmbeddedWallet.create(aztecNode, { ephemeral: true });
    await wallet.createSchnorrInitializerlessAccount(botAccount.secret, botAccount.salt, botAccount.signingKey);
=======
    wallet = await testSpan('setup:wallet', () => EmbeddedWallet.create(aztecNode, { ephemeral: true }));
    await testSpan('wallet:create', () =>
      wallet.createSchnorrInitializerlessAccount(botAccount.secret, botAccount.salt, botAccount.signingKey),
    );
>>>>>>> origin/v5-next
  });

  afterAll(() => teardown());

  let privateKeyIndex = 10;
  const getPrivateKey = () => new SecretValue(bufferToHex(getPrivateKeyFromIndex(privateKeyIndex++)!));

  // Tests the default Token-transfer Bot: send transfers, hardcoded-gas mode, and contract reuse.
  describe('transaction-bot', () => {
    let bot: Bot;
    beforeAll(async () => {
      config = {
        ...getBotDefaultConfig(),
        followChain: 'CHECKPOINTED',
        botMode: 'transfer',
        minFeePadding: PIPELINED_FEE_PADDING,
      };
      bot = await testSpan('setup:bot', async () =>
        Bot.create(config, wallet, aztecNode, undefined, new BotStore(await openTmpStore('bot'))),
      );
    });

    // Runs bot.run() once and asserts recipient private and public balances each increase by 1.
    it('sends token transfers from the bot', async () => {
      const { recipient: recipientBefore } = await bot.getBalances();

      await bot.run();
      const { recipient: recipientAfter } = await bot.getBalances();
      expect(recipientAfter.privateBalance - recipientBefore.privateBalance).toEqual(1n);
      expect(recipientAfter.publicBalance - recipientBefore.publicBalance).toEqual(1n);
    });

    // Updates bot config to use max DA and L2 gas limits (no simulation), runs, asserts balances +1.
    it('sends token transfers with hardcoded gas and no simulation', async () => {
      bot.updateConfig({ daGasLimit: MAX_TX_DA_GAS, l2GasLimit: MAX_PROCESSABLE_L2_GAS });
      const { recipient: recipientBefore } = await bot.getBalances();

      await bot.run();
      const { recipient: recipientAfter } = await bot.getBalances();
      expect(recipientAfter.privateBalance - recipientBefore.privateBalance).toEqual(1n);
      expect(recipientAfter.publicBalance - recipientBefore.publicBalance).toEqual(1n);
    });

    // Creates a second Bot instance with the same config and asserts it resolves the same
    // sender address and token contract as the first.
    it('reuses the same token contract', async () => {
      const { defaultAccountAddress, token } = bot;
      const bot2 = await Bot.create(config, wallet, aztecNode, undefined, new BotStore(await openTmpStore('bot')));
      expect(bot2.defaultAccountAddress.toString()).toEqual(defaultAccountAddress.toString());
      expect(bot2.token.address.toString()).toEqual(token.address.toString());
    });

    // Creates a bot using PrivateTokenContract variant and verifies only private balance changes.
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

  // Tests that a partially-completed fee-juice bridge claim is persisted in BotStore and
  // reused (not re-bridged) on a subsequent Bot.create call. Also verifies that a different
  // recipient address invalidates the stored claim. Actively drives L1 (fee juice bridging).
  describe('bridge resume', () => {
    let store: BotStore;

    beforeAll(async () => {
      store = await testSpan('setup:bot', async () => new BotStore(await openTmpStore('bot')));
    });

    afterAll(async () => {
      await store.close();
    });

    // First Bot.create call fails at deploy (mocked) after saving a bridge claim. Second call
    // succeeds without re-bridging (saveBridgeClaim not called again).
    it('reuses prior bridge claims', async () => {
      using saveSpy = jest.spyOn(store, 'saveBridgeClaim');
      const config: BotConfig = {
        ...getBotDefaultConfig(),

        followChain: 'CHECKPOINTED',
        botMode: 'transfer',

        // this bot has a well defined private key and salt
        senderPrivateKey: new SecretValue(Fr.fromString('0xcafe')),
        senderSalt: Fr.random(),

        l1RpcUrls,
        feePaymentMethod: 'fee_juice',
        // Use a dedicated L1 account (index 7) for bridging. The default mnemonic account (index 0)
        // is shared with the sequencer which sends L1 block proposals, causing nonce races on the
        // approve/deposit calls in bridgeL1FeeJuice. Indices 8 and 9 are used by other tests below.
        l1PrivateKey: new SecretValue(bufferToHex(getPrivateKeyFromIndex(7)!)),
        flushSetupTransactions: true,
        // Increase fee headroom to handle fee volatility from rapid block building in tests.
        // Fees can escalate >10x due to blocks built by earlier tests and bridge operations.
        minFeePadding: 99,
      };

      {
        using sendTx = jest.spyOn(EmbeddedWallet.prototype, 'sendTx');
        // Fail the fee juice top-up tx, which runs after the bridge claim has been persisted.
        sendTx.mockImplementation(() => {
          throw new Error('test error');
        });

        await expect(Bot.create(config, wallet, aztecNode, aztecNodeAdmin, store)).rejects.toThrow('test error');
        expect(saveSpy).toHaveBeenCalledOnce();
      }

      {
        saveSpy.mockClear();
        // The persisted claim is reused for the top-up, so no new claim is bridged or saved.
        await expect(Bot.create(config, wallet, aztecNode, aztecNodeAdmin, store)).resolves.toBeDefined();
        expect(saveSpy).not.toHaveBeenCalled();
      }
    });

    // Changes the sender salt between attempts; asserts a new bridge claim is triggered even though
    // the prior claim is in the store.
    it('does not reuse prior bridge claims if recipient address changes', async () => {
      using saveSpy = jest.spyOn(store, 'saveBridgeClaim');
      const config: BotConfig = {
        ...getBotDefaultConfig(),

        followChain: 'CHECKPOINTED',
        botMode: 'transfer',

        // this bot has a well defined private key and salt
        senderPrivateKey: new SecretValue(Fr.fromString('0xcafe')),
        senderSalt: Fr.random(),

        l1RpcUrls,
        feePaymentMethod: 'fee_juice',
        // See comment above — dedicated L1 account to avoid nonce races with the sequencer.
        l1PrivateKey: new SecretValue(bufferToHex(getPrivateKeyFromIndex(7)!)),
        flushSetupTransactions: true,
        // Increase fee headroom to handle fee volatility from rapid block building in tests.
        // This test is especially susceptible because changing salt triggers a new bridge claim,
        // adding more block building on top of what earlier tests already produced.
        minFeePadding: 99,
      };

      {
        using sendTx = jest.spyOn(EmbeddedWallet.prototype, 'sendTx');
        sendTx.mockImplementation(() => {
          throw new Error('test error');
        });
        await expect(Bot.create(config, wallet, aztecNode, aztecNodeAdmin, store)).rejects.toThrow('test error');
        expect(saveSpy).toHaveBeenCalledOnce();
      }
      {
        saveSpy.mockClear();

        // same private key, but different salt derives a different L2 address, so the persisted claim does
        // not apply and a fresh claim is bridged and saved
        config.senderSalt = config.senderSalt!.add(Fr.ONE);
        await expect(Bot.create(config, wallet, aztecNode, aztecNodeAdmin, store)).resolves.toBeDefined();
        expect(saveSpy).toHaveBeenCalledOnce();
      }
    });
  });

  // Tests the AmmBot: swaps a random token direction and verifies one private balance decreased
  // and one increased.
  describe('amm-bot', () => {
    let bot: AmmBot;
    beforeAll(async () => {
      config = {
        ...getBotDefaultConfig(),
        followChain: 'CHECKPOINTED',
        botMode: 'amm',
      };
      bot = await testSpan('setup:bot', async () =>
        AmmBot.create(config, wallet, aztecNode, undefined, new BotStore(await openTmpStore('bot'))),
      );
    });

    // Runs the AMM bot once and asserts one of the two private token balances decreased and
    // the other increased (direction is random).
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

  // Tests that Bot.create succeeds after the inbox drifts away from the rollup contract.
  // Actively drives L1 via advanceInboxInProgress.
  describe('setup via bridging funds cross-chain', () => {
    beforeAll(() => {
      config = {
        ...getBotDefaultConfig(),
        followChain: 'PROPOSED',
        botMode: 'transfer',
        senderPrivateKey: new SecretValue(Fr.random()),
        l1PrivateKey: getPrivateKey(),
        l1RpcUrls,
        flushSetupTransactions: true,
      };
    });

    // See 'can consume L1 to L2 message in %s after inbox drifts away from the rollup'
    // in end-to-end/src/e2e_cross_chain_messaging/l1_to_l2.test.ts for context on this test.
    // Advances inbox 4 slots then creates Bot; verifies it completes setup without error.
    it('creates bot after inbox drift', async () => {
      await cheatCodes.rollup.advanceInboxInProgress(4);
      await Bot.create(config, wallet, aztecNode, aztecNodeAdmin, new BotStore(await openTmpStore('bot')));
    }, 300_000);
  });

  // Tests the CrossChainBot: seeds L1→L2 messages and on each tick consumes one while seeding
  // a replacement. Actively drives L1 portal contracts.
  describe('cross-chain-bot', () => {
    let bot: CrossChainBot;

    beforeAll(async () => {
      config = {
        ...getBotDefaultConfig(),
        followChain: 'PROPOSED',
        botMode: 'crosschain',
        l1RpcUrls,
        l1PrivateKey: getPrivateKey(),
        flushSetupTransactions: true,
        l1ToL2SeedCount: 2,
      };
      bot = await testSpan('setup:bot', async () =>
        CrossChainBot.create(config, wallet, aztecNode, aztecNodeAdmin, new BotStore(await openTmpStore('bot'))),
      );
    }, 600_000);

    // Runs the cross-chain bot once; asserts a MinedTxReceipt is returned and the mined block
    // contains at least one non-zero L2→L1 message.
    it('sends L2→L1 and consumes L1→L2 messages', async () => {
      const result = await bot.run();
      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(MinedTxReceipt);

      const receipt = result as TxReceipt;
      expect(receipt.blockNumber).toBeDefined();

      // Verify L2→L1: the block should contain at least one non-zero L2→L1 message
      const block = await aztecNode.getBlock(receipt.blockNumber!, { includeTransactions: true });
      expect(block).toBeDefined();
      const l2ToL1Msgs = block!.body.txEffects.flatMap(e => e.l2ToL1Msgs).filter(m => !m.isZero());
      expect(l2ToL1Msgs.length).toBeGreaterThanOrEqual(1);
    }, 300_000);

    // Second bot.run() tick; asserts the result is defined, confirming the pipeline replenishment
    // from the first tick allows a second immediate consumption.
    it('replenishes the seeding pipeline across ticks', async () => {
      // Tick 2: the first tick consumed one message. This tick should seed a
      // replacement and still have a ready message to consume.
      const result = await bot.run();
      expect(result).toBeDefined();
    }, 300_000);
  });
});
