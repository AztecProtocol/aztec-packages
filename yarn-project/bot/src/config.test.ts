import { Fr } from '@aztec/foundation/curves/bn254';

import {
  type BotConfig,
  SupportedTokenContracts,
  applyInboxModeDefaults,
  assertValidInboxConfig,
  getBotConfigFromEnv,
  getBotDefaultConfig,
} from './config.js';

describe('bot config defaults', () => {
  it('keeps the defaults every existing mode relies on', () => {
    const config = getBotDefaultConfig();

    expect(config.botMode).toEqual('transfer');
    expect(config.followChain).toEqual('NONE');
    expect(config.txIntervalSeconds).toEqual(60);
    expect(config.txMinedWaitSeconds).toEqual(180);
    expect(config.l1ToL2MessageTimeoutSeconds).toEqual(3600);
    expect(config.privateTransfersPerTx).toEqual(1);
    expect(config.publicTransfersPerTx).toEqual(1);
    expect(config.l2ToL1MessagesPerTx).toEqual(1);
    expect(config.l1ToL2SeedCount).toEqual(1);
    expect(config.maxPendingTxs).toEqual(128);
    expect(config.maxConsecutiveErrors).toEqual(0);
    expect(config.minFeePadding).toEqual(3);
    expect(config.feePaymentMethod).toEqual('fee_juice');
    expect(config.contract).toEqual(SupportedTokenContracts.TokenContract);
    expect(config.tokenSalt).toEqual(Fr.fromHexString('1'));
    expect(config.noStart).toEqual(false);
    expect(config.flushSetupTransactions).toEqual(false);
    expect(config.stopWhenUnhealthy).toEqual(false);
  });

  it('defaults the new inbox fields', () => {
    const config = getBotDefaultConfig();

    expect(config.inboxMessagesPerBatch).toEqual(4);
    expect(config.inboxConsumeMode).toEqual('mixed');
    expect(config.inboxSaturationIntervalSeconds).toEqual(86400);
  });
});

describe('applyInboxModeDefaults', () => {
  it('leaves every other mode untouched', () => {
    for (const botMode of ['transfer', 'amm', 'crosschain'] as const) {
      const config: BotConfig = { ...getBotDefaultConfig(), botMode };
      expect(applyInboxModeDefaults(config)).toEqual(config);
    }
  });

  it('raises the outstanding message cap for inbox mode', () => {
    const config: BotConfig = { ...getBotDefaultConfig(), botMode: 'inbox' };

    expect(applyInboxModeDefaults(config).l1ToL2SeedCount).toEqual(512);
  });

  it('keeps an explicitly configured outstanding message cap', () => {
    const config: BotConfig = { ...getBotDefaultConfig(), botMode: 'inbox', l1ToL2SeedCount: 300 };

    expect(applyInboxModeDefaults(config).l1ToL2SeedCount).toEqual(300);
  });

  it('does not change any other field', () => {
    const config: BotConfig = { ...getBotDefaultConfig(), botMode: 'inbox' };

    expect(applyInboxModeDefaults(config)).toEqual({ ...config, l1ToL2SeedCount: 512 });
  });
});

describe('assertValidInboxConfig', () => {
  const inboxConfig = (overrides: Partial<BotConfig> = {}): BotConfig =>
    applyInboxModeDefaults({
      ...getBotDefaultConfig(),
      botMode: 'inbox',
      followChain: 'CHECKPOINTED',
      ...overrides,
    });

  it('accepts the inbox defaults', () => {
    expect(() => assertValidInboxConfig(inboxConfig())).not.toThrow();
  });

  it('ignores every other mode', () => {
    const config: BotConfig = { ...getBotDefaultConfig(), botMode: 'crosschain', inboxMessagesPerBatch: 0 };

    expect(() => assertValidInboxConfig(config)).not.toThrow();
  });

  it('rejects followChain NONE', () => {
    expect(() => assertValidInboxConfig(inboxConfig({ followChain: 'NONE' }))).toThrow(/followChain/);
  });

  it('rejects a batch size outside [1, 257]', () => {
    expect(() => assertValidInboxConfig(inboxConfig({ inboxMessagesPerBatch: 0 }))).toThrow(/inboxMessagesPerBatch/);
    expect(() => assertValidInboxConfig(inboxConfig({ inboxMessagesPerBatch: 258 }))).toThrow(/inboxMessagesPerBatch/);
    expect(() => assertValidInboxConfig(inboxConfig({ inboxMessagesPerBatch: 257 }))).not.toThrow();
  });

  it('rejects an outstanding cap below the batch size', () => {
    expect(() =>
      assertValidInboxConfig(
        inboxConfig({ l1ToL2SeedCount: 3, inboxMessagesPerBatch: 4, inboxSaturationIntervalSeconds: 0 }),
      ),
    ).toThrow(/at least inboxMessagesPerBatch/);
  });

  it('rejects an outstanding cap that cannot fit a saturation batch', () => {
    expect(() => assertValidInboxConfig(inboxConfig({ l1ToL2SeedCount: 256 }))).toThrow(/saturation/);
  });

  it('allows a small outstanding cap when saturation is disabled', () => {
    expect(() =>
      assertValidInboxConfig(inboxConfig({ l1ToL2SeedCount: 4, inboxSaturationIntervalSeconds: 0 })),
    ).not.toThrow();
  });

  it('rejects a negative saturation interval', () => {
    expect(() => assertValidInboxConfig(inboxConfig({ inboxSaturationIntervalSeconds: -1 }))).toThrow(
      /inboxSaturationIntervalSeconds/,
    );
  });
});

describe('getBotConfigFromEnv', () => {
  const envKeys = [
    'BOT_MODE',
    'BOT_INBOX_MESSAGES_PER_BATCH',
    'BOT_INBOX_CONSUME_MODE',
    'BOT_INBOX_SATURATION_INTERVAL_SECONDS',
  ];
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('reads the inbox mode and its settings', () => {
    process.env.BOT_MODE = 'inbox';
    process.env.BOT_INBOX_MESSAGES_PER_BATCH = '16';
    process.env.BOT_INBOX_CONSUME_MODE = 'private';
    process.env.BOT_INBOX_SATURATION_INTERVAL_SECONDS = '0';

    const config = getBotConfigFromEnv();

    expect(config.botMode).toEqual('inbox');
    expect(config.inboxMessagesPerBatch).toEqual(16);
    expect(config.inboxConsumeMode).toEqual('private');
    expect(config.inboxSaturationIntervalSeconds).toEqual(0);
  });

  it('rejects an unknown consume mode', () => {
    process.env.BOT_INBOX_CONSUME_MODE = 'both';

    expect(() => getBotConfigFromEnv()).toThrow(/BOT_INBOX_CONSUME_MODE/);
  });
});
