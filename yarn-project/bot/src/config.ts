import { Fr } from '@aztec/circuits.js';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

const BotFollowChain = ['NONE', 'PENDING', 'PROVEN'] as const;
type BotFollowChain = (typeof BotFollowChain)[number];

export enum SupportedTokenContracts {
  TokenContract = 'TokenContract',
  EasyPrivateTokenContract = 'EasyPrivateTokenContract',
}

export type BotConfig = {
  /** The URL to the Aztec node to check for tx pool status. */
  nodeUrl: string | undefined;
  /** URL to the PXE for sending txs, or undefined if an in-proc PXE is used. */
  pxeUrl: string | undefined;
  /** Signing private key for the sender account. */
  senderPrivateKey: Fr;
  /** Encryption secret for a recipient account. */
  recipientEncryptionSecret: Fr;
  /** Salt for the token contract deployment. */
  tokenSalt: Fr;
  /** Every how many seconds should a new tx be sent. */
  txIntervalSeconds: number;
  /** How many private token transfers are executed per tx. */
  privateTransfersPerTx: number;
  /** How many public token transfers are executed per tx. */
  publicTransfersPerTx: number;
  /** How to handle fee payments. */
  feePaymentMethod: 'fee_juice' | 'none';
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
  /** Whether to skip public simulation of txs before sending them. */
  skipPublicSimulation: boolean;
  /** L2 gas limit for the tx (empty to have the bot trigger an estimate gas). */
  l2GasLimit: number | undefined;
  /** DA gas limit for the tx (empty to have the bot trigger an estimate gas). */
  daGasLimit: number | undefined;
  /** Token contract to use */
  contract: SupportedTokenContracts;
  /** The maximum number of consecutive errors before the bot shuts down */
  maxConsecutiveErrors: number;
  /** Stops the bot if service becomes unhealthy */
  stopWhenUnhealthy: boolean;
};

export const BotConfigSchema = z
  .object({
    nodeUrl: z.string().optional(),
    pxeUrl: z.string().optional(),
    senderPrivateKey: schemas.Fr,
    recipientEncryptionSecret: schemas.Fr,
    tokenSalt: schemas.Fr,
    txIntervalSeconds: z.number(),
    privateTransfersPerTx: z.number(),
    publicTransfersPerTx: z.number(),
    feePaymentMethod: z.union([z.literal('fee_juice'), z.literal('none')]),
    noStart: z.boolean(),
    txMinedWaitSeconds: z.number(),
    followChain: z.enum(BotFollowChain),
    maxPendingTxs: z.number(),
    flushSetupTransactions: z.boolean(),
    skipPublicSimulation: z.boolean(),
    l2GasLimit: z.number().optional(),
    daGasLimit: z.number().optional(),
    contract: z.nativeEnum(SupportedTokenContracts),
    maxConsecutiveErrors: z.number(),
    stopWhenUnhealthy: z.boolean(),
  })
  .transform(config => ({
    nodeUrl: undefined,
    pxeUrl: undefined,
    l2GasLimit: undefined,
    daGasLimit: undefined,
    ...config,
  })) satisfies ZodFor<BotConfig>;

export const botConfigMappings: ConfigMappingsType<BotConfig> = {
  nodeUrl: {
    env: 'AZTEC_NODE_URL',
    description: 'The URL to the Aztec node to check for tx pool status.',
  },
  pxeUrl: {
    env: 'BOT_PXE_URL',
    description: 'URL to the PXE for sending txs, or undefined if an in-proc PXE is used.',
  },
  senderPrivateKey: {
    env: 'BOT_PRIVATE_KEY',
    description: 'Signing private key for the sender account.',
    parseEnv: (val: string) => Fr.fromString(val),
    defaultValue: Fr.random(),
  },
  recipientEncryptionSecret: {
    env: 'BOT_RECIPIENT_ENCRYPTION_SECRET',
    description: 'Encryption secret for a recipient account.',
    parseEnv: (val: string) => Fr.fromString(val),
    defaultValue: Fr.fromString('0xcafecafe'),
  },
  tokenSalt: {
    env: 'BOT_TOKEN_SALT',
    description: 'Salt for the token contract deployment.',
    parseEnv: (val: string) => Fr.fromString(val),
    defaultValue: Fr.fromString('1'),
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
    description: 'How to handle fee payments. (Options: fee_juice, none)',
    parseEnv: val => (val as 'fee_juice' | 'none') || undefined,
    defaultValue: 'none',
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
      if (!(BotFollowChain as readonly string[]).includes(val.toUpperCase())) {
        throw new Error(`Invalid value for BOT_FOLLOW_CHAIN: ${val}`);
      }
      return val as BotFollowChain;
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
  skipPublicSimulation: {
    env: 'BOT_SKIP_PUBLIC_SIMULATION',
    description: 'Whether to skip public simulation of txs before sending them.',
    ...booleanConfigHelper(false),
  },
  l2GasLimit: {
    env: 'BOT_L2_GAS_LIMIT',
    description: 'L2 gas limit for the tx (empty to have the bot trigger an estimate gas).',
    ...optionalNumberConfigHelper(),
  },
  daGasLimit: {
    env: 'BOT_DA_GAS_LIMIT',
    description: 'DA gas limit for the tx (empty to have the bot trigger an estimate gas).',
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
};

export function getBotConfigFromEnv(): BotConfig {
  return getConfigFromMappings<BotConfig>(botConfigMappings);
}

export function getBotDefaultConfig(): BotConfig {
  return getDefaultConfig<BotConfig>(botConfigMappings);
}
