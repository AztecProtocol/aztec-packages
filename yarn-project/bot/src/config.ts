import { MAX_L1_TO_L2_MSGS_PER_BLOCK } from '@aztec/constants';
import {
  type ConfigMappingsType,
  SecretValue,
  booleanConfigHelper,
  floatConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
  optionalNumberConfigHelper,
  pickConfigMappings,
  secretFrConfigHelper,
  secretStringConfigHelper,
} from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/stdlib/kv-store';
import { schemas, zodFor } from '@aztec/stdlib/schemas';
import type { ComponentsVersions } from '@aztec/stdlib/versioning';

import { z } from 'zod';

const BotFollowChain = ['NONE', 'PROPOSED', 'CHECKPOINTED', 'PROVEN'] as const;
type BotFollowChain = (typeof BotFollowChain)[number];

const BotMode = ['transfer', 'amm', 'crosschain', 'inbox'] as const;
type BotMode = (typeof BotMode)[number];

const BotInboxConsumeMode = ['mixed', 'public', 'private'] as const;
/** Which L2 domain the inbox bot consumes its messages through. */
export type BotInboxConsumeMode = (typeof BotInboxConsumeMode)[number];

/** Largest number of messages a single Inbox bucket holds before the next message rolls it over. */
export const MAX_INBOX_MESSAGES_PER_BUCKET = MAX_L1_TO_L2_MSGS_PER_BLOCK;

/** Largest number of messages that fit in a single Inbox bucket, plus the one that rolls it over. */
export const MAX_INBOX_MESSAGES_PER_BATCH = MAX_INBOX_MESSAGES_PER_BUCKET + 1;

/** Effective `l1ToL2SeedCount` for inbox mode when the operator left it at its default. */
const INBOX_DEFAULT_L1_TO_L2_SEED_COUNT = 512;

export enum SupportedTokenContracts {
  TokenContract = 'TokenContract',
  PrivateTokenContract = 'PrivateTokenContract',
}

export type BotConfig = {
  /** The URL to the Aztec node to check for tx pool status. */
  nodeUrl: string | undefined;
  /** The URL to the Aztec node admin API to force-flush txs if configured. */
  nodeAdminUrl: string | undefined;
  /** Url of the ethereum host. */
  l1RpcUrls: string[] | undefined;
  /** The mnemonic for the account to bridge fee juice from L1. */
  l1Mnemonic: SecretValue<string> | undefined;
  /** The private key for the account to bridge fee juice from L1. */
  l1PrivateKey: SecretValue<string> | undefined;
  /** How long to wait for L1 to L2 messages to become available on L2 */
  l1ToL2MessageTimeoutSeconds: number;
  /** Signing private key for the sender account. */
  senderPrivateKey: SecretValue<Fr> | undefined;
  /** Optional salt to use to instantiate the sender account */
  senderSalt: Fr | undefined;
  /** Salt for the token contract instantiation. */
  tokenSalt: Fr;
  /** Every how many seconds should a new tx be sent. */
  txIntervalSeconds: number;
  /** How many private token transfers are executed per tx. */
  privateTransfersPerTx: number;
  /** How many public token transfers are executed per tx. */
  publicTransfersPerTx: number;
  /** How to handle fee payments. */
  feePaymentMethod: 'fee_juice';
  /** 'How much is the bot willing to overpay vs. the current min fee' */
  minFeePadding: number;
  /** True to not automatically setup or start the bot on initialization. */
  noStart: boolean;
  /** How long to wait for a tx to be mined before reporting an error. */
  txMinedWaitSeconds: number;
  /** Whether to wait for txs to be proven, to be mined, or no wait at all. */
  followChain: BotFollowChain;
  /** Do not send a tx if the node's tx pool already has this many pending txs. */
  maxPendingTxs: number;
  /** Whether to flush after sending each 'setup' transaction */
  flushSetupTransactions: boolean;
  /** L2 gas limit for the tx (empty to let the bot's wallet estimate). */
  l2GasLimit: number | undefined;
  /** DA gas limit for the tx (empty to let the bot's wallet estimate). */
  daGasLimit: number | undefined;
  /** Token contract to use */
  contract: SupportedTokenContracts;
  /** The maximum number of consecutive errors before the bot shuts down */
  maxConsecutiveErrors: number;
  /** Stops the bot if service becomes unhealthy */
  stopWhenUnhealthy: boolean;
  /** Bot mode: transfer, amm, or crosschain. */
  botMode: BotMode;
  /** Number of L2→L1 messages per tx (crosschain mode). */
  l2ToL1MessagesPerTx: number;
  /** Max L1→L2 messages to keep in-flight (crosschain mode). */
  l1ToL2SeedCount: number;
  /** How many L1→L2 messages the inbox bot sends per atomic L1 batch (inbox mode). */
  inboxMessagesPerBatch: number;
  /** Which L2 domain the inbox bot consumes its messages through (inbox mode). */
  inboxConsumeMode: BotInboxConsumeMode;
  /** How often the inbox bot runs a full-bucket saturation batch, in seconds; 0 disables it (inbox mode). */
  inboxSaturationIntervalSeconds: number;
} & Pick<DataStoreConfig, 'dataDirectory' | 'dataStoreMapSizeKb'>;

export const BotConfigSchema = zodFor<BotConfig>()(
  z
    .object({
      nodeUrl: z.string().optional(),
      nodeAdminUrl: z.string().optional(),
      l1RpcUrls: z.array(z.string()).optional(),
      l1Mnemonic: schemas.SecretValue(z.string()).optional(),
      l1PrivateKey: schemas.SecretValue(z.string()).optional(),
      l1ToL2MessageTimeoutSeconds: z.number(),
      senderPrivateKey: schemas.SecretValue(schemas.Fr).optional(),
      senderSalt: schemas.Fr.optional(),
      tokenSalt: schemas.Fr,
      txIntervalSeconds: z.number(),
      privateTransfersPerTx: z.number().int().nonnegative(),
      publicTransfersPerTx: z.number().int().nonnegative(),
      feePaymentMethod: z.literal('fee_juice'),
      minFeePadding: z.number().nonnegative(),
      noStart: z.boolean(),
      txMinedWaitSeconds: z.number(),
      followChain: z.enum(BotFollowChain),
      maxPendingTxs: z.number().int().nonnegative(),
      flushSetupTransactions: z.boolean(),
      l2GasLimit: z.number().int().nonnegative().optional(),
      daGasLimit: z.number().int().nonnegative().optional(),
      contract: z.nativeEnum(SupportedTokenContracts),
      maxConsecutiveErrors: z.number().int().nonnegative(),
      stopWhenUnhealthy: z.boolean(),
      botMode: z.enum(BotMode).default('transfer'),
      l2ToL1MessagesPerTx: z.number().int().nonnegative().default(1),
      l1ToL2SeedCount: z.number().int().nonnegative().default(1),
      inboxMessagesPerBatch: z.number().int().min(1).max(MAX_INBOX_MESSAGES_PER_BATCH).default(4),
      inboxConsumeMode: z.enum(BotInboxConsumeMode).default('mixed'),
      inboxSaturationIntervalSeconds: z.number().int().nonnegative().default(86400),
      dataDirectory: z.string().optional(),
      dataStoreMapSizeKb: z.number().optional(),
    })
    .transform(config => ({
      nodeUrl: undefined,
      nodeAdminUrl: undefined,
      l1RpcUrls: undefined,
      senderSalt: undefined,
      l2GasLimit: undefined,
      daGasLimit: undefined,
      l1Mnemonic: undefined,
      l1PrivateKey: undefined,
      senderPrivateKey: undefined,
      dataStoreMapSizeKb: 1_024 * 1_024,
      ...config,
    })),
);

export const botConfigMappings: ConfigMappingsType<BotConfig> = {
  nodeUrl: {
    env: 'AZTEC_NODE_URL',
    description: 'The URL to the Aztec node to check for tx pool status.',
  },
  nodeAdminUrl: {
    env: 'AZTEC_NODE_ADMIN_URL',
    description: 'The URL to the Aztec node admin API to force-flush txs if configured.',
  },
  l1RpcUrls: {
    env: 'ETHEREUM_HOSTS',
    description: 'URL of the ethereum host.',
    parseEnv: (val: string) => val.split(',').map(url => url.trim()),
  },
  l1Mnemonic: {
    env: 'BOT_L1_MNEMONIC',
    description: 'The mnemonic for the account to bridge fee juice from L1.',
    ...secretStringConfigHelper(),
  },
  l1PrivateKey: {
    env: 'BOT_L1_PRIVATE_KEY',
    description: 'The private key for the account to bridge fee juice from L1.',
    ...secretStringConfigHelper(),
  },
  l1ToL2MessageTimeoutSeconds: {
    env: 'BOT_L1_TO_L2_TIMEOUT_SECONDS',
    description: 'How long to wait for L1 to L2 messages to become available on L2',
    ...numberConfigHelper(3600),
  },
  senderPrivateKey: {
    env: 'BOT_PRIVATE_KEY',
    description: 'Signing private key for the sender account.',
    ...secretFrConfigHelper(),
  },
  senderSalt: {
    env: 'BOT_ACCOUNT_SALT',
    description: 'The salt to use to deploy the sender account.',
    parseEnv: (val: string) => (val ? Fr.fromHexString(val) : undefined),
  },
  tokenSalt: {
    env: 'BOT_TOKEN_SALT',
    description: 'The salt to use to deploy the token contract.',
    parseEnv: (val: string) => Fr.fromHexString(val),
    defaultValue: Fr.fromHexString('1'),
  },
  txIntervalSeconds: {
    env: 'BOT_TX_INTERVAL_SECONDS',
    description: 'Every how many seconds should a new tx be sent.',
    ...numberConfigHelper(60),
  },
  privateTransfersPerTx: {
    env: 'BOT_PRIVATE_TRANSFERS_PER_TX',
    description: 'How many private token transfers are executed per tx.',
    ...numberConfigHelper(1),
  },
  publicTransfersPerTx: {
    env: 'BOT_PUBLIC_TRANSFERS_PER_TX',
    description: 'How many public token transfers are executed per tx.',
    ...numberConfigHelper(1),
  },
  feePaymentMethod: {
    env: 'BOT_FEE_PAYMENT_METHOD',
    description: 'How to handle fee payments. (Options: fee_juice)',
    parseEnv: val => (val as 'fee_juice') || undefined,
    defaultValue: 'fee_juice',
  },
  minFeePadding: {
    env: 'BOT_MIN_FEE_PADDING',
    description: 'How much is the bot willing to overpay vs. the current base fee',
    ...floatConfigHelper(3),
  },
  noStart: {
    env: 'BOT_NO_START',
    description: 'True to not automatically setup or start the bot on initialization.',
    ...booleanConfigHelper(),
  },
  txMinedWaitSeconds: {
    env: 'BOT_TX_MINED_WAIT_SECONDS',
    description: 'How long to wait for a tx to be mined before reporting an error.',
    ...numberConfigHelper(180),
  },
  followChain: {
    env: 'BOT_FOLLOW_CHAIN',
    description: 'Which chain the bot follows',
    defaultValue: 'NONE',
    parseEnv(val) {
      const upper = val.toUpperCase();
      if (upper === 'PENDING') {
        return 'CHECKPOINTED';
      }
      if (!(BotFollowChain as readonly string[]).includes(upper)) {
        throw new Error(`Invalid value for BOT_FOLLOW_CHAIN: ${val}`);
      }
      return upper as BotFollowChain;
    },
  },
  maxPendingTxs: {
    env: 'BOT_MAX_PENDING_TXS',
    description: "Do not send a tx if the node's tx pool already has this many pending txs.",
    ...numberConfigHelper(128),
  },
  flushSetupTransactions: {
    env: 'BOT_FLUSH_SETUP_TRANSACTIONS',
    description: 'Make a request for the sequencer to build a block after each setup transaction.',
    ...booleanConfigHelper(false),
  },
  l2GasLimit: {
    env: 'BOT_L2_GAS_LIMIT',
    description: "L2 gas limit for the tx (empty to let the bot's wallet estimate).",
    ...optionalNumberConfigHelper(),
  },
  daGasLimit: {
    env: 'BOT_DA_GAS_LIMIT',
    description: "DA gas limit for the tx (empty to let the bot's wallet estimate).",
    ...optionalNumberConfigHelper(),
  },
  contract: {
    env: 'BOT_TOKEN_CONTRACT',
    description: 'Token contract to use',
    defaultValue: SupportedTokenContracts.TokenContract,
    parseEnv(val) {
      if (!Object.values(SupportedTokenContracts).includes(val as any)) {
        throw new Error(
          `Invalid value for BOT_TOKEN_CONTRACT: ${val}. Valid values: ${Object.values(SupportedTokenContracts).join(
            ', ',
          )}`,
        );
      }
      return val as SupportedTokenContracts;
    },
  },
  maxConsecutiveErrors: {
    env: 'BOT_MAX_CONSECUTIVE_ERRORS',
    description: 'The maximum number of consecutive errors before the bot shuts down',
    ...numberConfigHelper(0),
  },
  stopWhenUnhealthy: {
    env: 'BOT_STOP_WHEN_UNHEALTHY',
    description: 'Stops the bot if service becomes unhealthy',
    ...booleanConfigHelper(false),
  },
  botMode: {
    env: 'BOT_MODE',
    description: 'Bot mode: transfer, amm, crosschain, or inbox',
    defaultValue: 'transfer' as BotMode,
    parseEnv(val: string) {
      if (!(BotMode as readonly string[]).includes(val)) {
        throw new Error(`Invalid value for BOT_MODE: ${val}`);
      }
      return val as BotMode;
    },
  },
  l2ToL1MessagesPerTx: {
    env: 'BOT_L2_TO_L1_MESSAGES_PER_TX',
    description: 'Number of L2→L1 messages per tx (crosschain mode)',
    ...numberConfigHelper(1),
  },
  l1ToL2SeedCount: {
    env: 'BOT_L1_TO_L2_SEED_COUNT',
    description: 'Max L1→L2 messages to keep in-flight (crosschain and inbox modes)',
    ...numberConfigHelper(1),
  },
  inboxMessagesPerBatch: {
    env: 'BOT_INBOX_MESSAGES_PER_BATCH',
    description: 'How many L1→L2 messages the inbox bot sends per atomic L1 batch (inbox mode)',
    ...numberConfigHelper(4),
  },
  inboxConsumeMode: {
    env: 'BOT_INBOX_CONSUME_MODE',
    description: 'Which L2 domain the inbox bot consumes through: mixed, public, or private (inbox mode)',
    defaultValue: 'mixed' as BotInboxConsumeMode,
    parseEnv(val: string) {
      if (!(BotInboxConsumeMode as readonly string[]).includes(val)) {
        throw new Error(
          `Invalid value for BOT_INBOX_CONSUME_MODE: ${val}. Valid values: ${BotInboxConsumeMode.join(', ')}`,
        );
      }
      return val as BotInboxConsumeMode;
    },
  },
  inboxSaturationIntervalSeconds: {
    env: 'BOT_INBOX_SATURATION_INTERVAL_SECONDS',
    description: 'How often the inbox bot runs a full-bucket saturation batch, in seconds; 0 disables it',
    ...numberConfigHelper(86400),
  },
  ...pickConfigMappings(dataConfigMappings, ['dataStoreMapSizeKb', 'dataDirectory']),
};

export function getBotConfigFromEnv(): BotConfig {
  return getConfigFromMappings<BotConfig>(botConfigMappings);
}

export function getBotDefaultConfig(): BotConfig {
  return getDefaultConfig<BotConfig>(botConfigMappings);
}

/**
 * Returns the config with inbox-mode effective defaults applied. Other modes are returned untouched, so
 * `getBotDefaultConfig()` and the transfer/amm/crosschain paths are unaffected.
 *
 * Inbox mode needs a far larger outstanding-message allowance than crosschain's single in-flight message.
 * `BotConfig` has no representation for "unset", so a field still equal to its `getBotDefaultConfig()` value is
 * taken to have been left alone and gets the inbox default; any other value is the operator's and wins.
 */
export function applyInboxModeDefaults(config: BotConfig): BotConfig {
  if (config.botMode !== 'inbox') {
    return config;
  }
  const defaults = getBotDefaultConfig();
  return {
    ...config,
    l1ToL2SeedCount:
      config.l1ToL2SeedCount === defaults.l1ToL2SeedCount ? INBOX_DEFAULT_L1_TO_L2_SEED_COUNT : config.l1ToL2SeedCount,
  };
}

/**
 * Throws a descriptive error if the config cannot drive the inbox bot. Values are never silently clamped: an
 * operator who asks for an impossible configuration is told, rather than getting a bot that quietly stalls.
 */
export function assertValidInboxConfig(config: BotConfig): void {
  if (config.botMode !== 'inbox') {
    return;
  }
  if (config.followChain === 'NONE') {
    throw new Error(`Inbox bot requires followChain to be set (got NONE)`);
  }
  if (
    !Number.isInteger(config.inboxMessagesPerBatch) ||
    config.inboxMessagesPerBatch < 1 ||
    config.inboxMessagesPerBatch > MAX_INBOX_MESSAGES_PER_BATCH
  ) {
    throw new Error(
      `Inbox bot requires inboxMessagesPerBatch in [1, ${MAX_INBOX_MESSAGES_PER_BATCH}] (got ${config.inboxMessagesPerBatch})`,
    );
  }
  if (!Number.isInteger(config.inboxSaturationIntervalSeconds) || config.inboxSaturationIntervalSeconds < 0) {
    throw new Error(
      `Inbox bot requires a nonnegative integer inboxSaturationIntervalSeconds (got ${config.inboxSaturationIntervalSeconds})`,
    );
  }
  if (config.l1ToL2SeedCount < config.inboxMessagesPerBatch) {
    throw new Error(
      `Inbox bot requires l1ToL2SeedCount (${config.l1ToL2SeedCount}) to be at least inboxMessagesPerBatch (${config.inboxMessagesPerBatch}), otherwise the outstanding-message cap blocks production`,
    );
  }
  if (config.inboxSaturationIntervalSeconds > 0 && config.l1ToL2SeedCount < MAX_INBOX_MESSAGES_PER_BATCH) {
    throw new Error(
      `Inbox bot with saturation enabled requires l1ToL2SeedCount to be at least ${MAX_INBOX_MESSAGES_PER_BATCH} (got ${config.l1ToL2SeedCount}), otherwise a saturation batch can never fit under the outstanding-message cap`,
    );
  }
}

export function getVersions(): Partial<ComponentsVersions> {
  return {
    l2ProtocolContractsHash: protocolContractsHash.toString(),
    l2CircuitsVkTreeRoot: getVKTreeRoot().toString(),
  };
}
