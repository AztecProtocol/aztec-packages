import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/fields';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { type ZodFor, schemas } from '@aztec/stdlib/schemas';
import type { ComponentsVersions } from '@aztec/stdlib/versioning';

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
  /** The URL to the Aztec node admin API to force-flush txs if configured. */
  nodeAdminUrl: string | undefined;
  /** URL to the PXE for sending txs, or undefined if an in-proc PXE is used. */
  pxeUrl: string | undefined;
  /** Url of the ethereum host. */
  l1RpcUrls: string[] | undefined;
  /** The mnemonic for the account to bridge fee juice from L1. */
  l1Mnemonic: string | undefined;
  /** The private key for the account to bridge fee juice from L1. */
  l1PrivateKey: string | undefined;
  /** Signing private key for the sender account. */
  senderPrivateKey: Fr | undefined;
  /** Optional salt to use to deploy the sender account */
  senderSalt: Fr | undefined;
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
  feePaymentMethod: 'fee_juice';
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
  /** Deploy an AMM contract and do swaps instead of transfers */
  ammTxs: boolean;
};

export const BotConfigSchema = z
  .object({
    nodeUrl: z.string().optional(),
    nodeAdminUrl: z.string().optional(),
    pxeUrl: z.string().optional(),
    l1RpcUrls: z.array(z.string()).optional(),
    l1Mnemonic: z.string().optional(),
    l1PrivateKey: z.string().optional(),
    senderPrivateKey: schemas.Fr.optional(),
    senderSalt: schemas.Fr.optional(),
    recipientEncryptionSecret: schemas.Fr,
    tokenSalt: schemas.Fr,
    txIntervalSeconds: z.number(),
    privateTransfersPerTx: z.number().int().nonnegative(),
    publicTransfersPerTx: z.number().int().nonnegative(),
    feePaymentMethod: z.literal('fee_juice'),
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
    ammTxs: z.boolean().default(false),
  })
  .transform(config => ({
    nodeUrl: undefined,
    nodeAdminUrl: undefined,
    pxeUrl: undefined,
    l1RpcUrls: undefined,
    l1Mnemonic: undefined,
    l1PrivateKey: undefined,
    senderPrivateKey: undefined,
    senderSalt: undefined,
    l2GasLimit: undefined,
    daGasLimit: undefined,
    ...config,
  })) satisfies ZodFor<BotConfig>;

export const botConfigMappings: ConfigMappingsType<BotConfig> = {
  nodeUrl: {
    env: 'AZTEC_NODE_URL',
    description: 'The URL to the Aztec node to check for tx pool status.',
  },
  nodeAdminUrl: {
    env: 'AZTEC_NODE_ADMIN_URL',
    description: 'The URL to the Aztec node admin API to force-flush txs if configured.',
  },
  pxeUrl: {
    env: 'BOT_PXE_URL',
    description: 'URL to the PXE for sending txs, or undefined if an in-proc PXE is used.',
  },
  l1RpcUrls: {
    env: 'ETHEREUM_HOSTS',
    description: 'URL of the ethereum host.',
    parseEnv: (val: string) => val.split(',').map(url => url.trim()),
  },
  l1Mnemonic: {
    env: 'BOT_L1_MNEMONIC',
    description: 'The mnemonic for the account to bridge fee juice from L1.',
  },
  l1PrivateKey: {
    env: 'BOT_L1_PRIVATE_KEY',
    description: 'The private key for the account to bridge fee juice from L1.',
  },
  senderPrivateKey: {
    env: 'BOT_PRIVATE_KEY',
    description: 'Signing private key for the sender account.',
    parseEnv: (val: string) => (val ? Fr.fromHexString(val) : undefined),
  },
  senderSalt: {
    env: 'BOT_ACCOUNT_SALT',
    description: 'The salt to use to deploys the sender account.',
    parseEnv: (val: string) => (val ? Fr.fromHexString(val) : undefined),
  },
  recipientEncryptionSecret: {
    env: 'BOT_RECIPIENT_ENCRYPTION_SECRET',
    description: 'Encryption secret for a recipient account.',
    parseEnv: (val: string) => Fr.fromHexString(val),
    defaultValue: Fr.fromHexString('0xcafecafe'),
  },
  tokenSalt: {
    env: 'BOT_TOKEN_SALT',
    description: 'Salt for the token contract deployment.',
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
  ammTxs: {
    env: 'BOT_AMM_TXS',
    description: 'Deploy an AMM and send swaps to it',
    ...booleanConfigHelper(false),
  },
};

export function getBotConfigFromEnv(): BotConfig {
  return getConfigFromMappings<BotConfig>(botConfigMappings);
}

export function getBotDefaultConfig(): BotConfig {
  return getDefaultConfig<BotConfig>(botConfigMappings);
}

export function getVersions(): Partial<ComponentsVersions> {
  return {
    l2ProtocolContractsTreeRoot: protocolContractTreeRoot.toString(),
    l2CircuitsVkTreeRoot: getVKTreeRoot().toString(),
  };
}
