import { DEFAULT_MAX_DEBUG_LOG_MEMORY_READS } from '@aztec/constants';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  numberConfigHelper,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';

const parseCommaSeparatedList = (value: string) =>
  value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

/** Default max time an RPC query is held while waiting for an unknown anchor block hash or archive root. */
export const DEFAULT_RPC_UNSEEN_BLOCK_BY_HASH_WAIT_MS = 3000;

export const nodeRpcConfigMappings: ConfigMappingsType<NodeRPCConfig> = {
  rpcSimulatePublicMaxGasLimit: {
    env: 'RPC_SIMULATE_PUBLIC_MAX_GAS_LIMIT',
    description: 'Maximum gas limit for public tx simulation in the node on `simulatePublicCalls`.',
    ...numberConfigHelper(10e9),
  },
  rpcSimulatePublicMaxDebugLogMemoryReads: {
    env: 'RPC_SIMULATE_PUBLIC_MAX_DEBUG_LOG_MEMORY_READS',
    description:
      'Maximum memory reads for debug logs performed for public tx simulation in the node on `simulatePublicCalls`. ',
    ...numberConfigHelper(DEFAULT_MAX_DEBUG_LOG_MEMORY_READS),
  },
  rpcMaxBatchSize: {
    env: 'RPC_MAX_BATCH_SIZE',
    description: 'Maximum allowed batch size for JSON RPC batch requests.',
    ...numberConfigHelper(100),
  },
  rpcMaxBodySize: {
    env: 'RPC_MAX_BODY_SIZE',
    description: 'Maximum allowed batch size for JSON RPC batch requests.',
    defaultValue: '1mb',
  },
  rpcHttpKeepAliveTimeoutMs: {
    env: 'RPC_HTTP_KEEP_ALIVE_TIMEOUT_MS',
    description: 'HTTP keep-alive timeout for JSON RPC connections in milliseconds.',
    ...numberConfigHelper(5_000),
  },
  rpcHttpHeadersTimeoutMs: {
    env: 'RPC_HTTP_HEADERS_TIMEOUT_MS',
    description: 'Timeout for receiving complete HTTP headers on JSON RPC connections in milliseconds.',
    ...numberConfigHelper(60_000),
  },
  rpcCorsAllowedOrigins: {
    env: 'RPC_CORS_ALLOWED_ORIGINS',
    description: 'Origins allowed to make credentialed cross-origin JSON RPC requests, separated by commas.',
    parseEnv: parseCommaSeparatedList,
    defaultValue: [],
  },
  rpcCorsAllowedHeaders: {
    env: 'RPC_CORS_ALLOWED_HEADERS',
    description: 'Headers allowed in cross-origin JSON RPC requests, separated by commas.',
    parseEnv: parseCommaSeparatedList,
    defaultValue: [],
  },
  rpcCorsAllowAnyOrigin: {
    env: 'RPC_CORS_ALLOW_ANY_ORIGIN',
    description: 'Allow credentialed cross-origin JSON RPC requests from any origin.',
    ...booleanConfigHelper(false),
  },
  rpcUnseenBlockByNumberWaitMs: {
    env: 'RPC_UNSEEN_BLOCK_BY_NUMBER_WAIT_MS',
    description:
      'Max time in ms an RPC query anchored on a block number exactly one ahead of the node tip is held, waiting ' +
      'for the block to arrive. Defaults to twice the block duration. Set to 0 to fail these queries immediately.',
    ...optionalNumberConfigHelper(),
  },
  rpcUnseenBlockByHashWaitMs: {
    env: 'RPC_UNSEEN_BLOCK_BY_HASH_WAIT_MS',
    description:
      'Max time in ms an RPC query anchored on an unknown block hash or archive root is held, waiting for the ' +
      'block to arrive. Set to 0 to fail these queries immediately.',
    ...numberConfigHelper(DEFAULT_RPC_UNSEEN_BLOCK_BY_HASH_WAIT_MS),
  },
};

export type NodeRPCConfig = {
  /** Maximum gas limit for public tx simulation in the node on `simulatePublicCalls`. */
  rpcSimulatePublicMaxGasLimit: number;
  /** Maximum memory reads for debug logs performed for public tx simulation in the node on `simulatePublicCalls`. */
  rpcSimulatePublicMaxDebugLogMemoryReads: number;
  /** Maximum allowed batch size for JSON RPC batch requests. */
  rpcMaxBatchSize: number;
  /** The maximum body size the RPC server will accept */
  rpcMaxBodySize: string;
  /** HTTP keep-alive timeout for JSON RPC connections in milliseconds. */
  rpcHttpKeepAliveTimeoutMs?: number;
  /** Timeout for receiving complete HTTP headers on JSON RPC connections in milliseconds. */
  rpcHttpHeadersTimeoutMs?: number;
  /** Origins allowed to make credentialed cross-origin requests to the RPC server. */
  rpcCorsAllowedOrigins?: string[];
  /** Headers allowed in cross-origin requests to the RPC server. */
  rpcCorsAllowedHeaders?: string[];
  /** Whether to allow credentialed cross-origin requests from any origin. */
  rpcCorsAllowAnyOrigin?: boolean;
  /**
   * Max time in ms an RPC query anchored on a block number exactly one ahead of the node tip is held, waiting for
   * the block to arrive. Defaults to twice the block duration when unset. 0 disables the hold-off.
   */
  rpcUnseenBlockByNumberWaitMs?: number;
  /**
   * Max time in ms an RPC query anchored on an unknown block hash or archive root is held, waiting for the block to
   * arrive. 0 disables the hold-off.
   */
  rpcUnseenBlockByHashWaitMs: number;
};

/** Resolves the CORS origin policy for an RPC server. */
export function getRpcCorsAllowedOrigins(
  config: Pick<NodeRPCConfig, 'rpcCorsAllowedOrigins' | 'rpcCorsAllowAnyOrigin'>,
): string[] {
  return config.rpcCorsAllowAnyOrigin ? ['*'] : (config.rpcCorsAllowedOrigins ?? []);
}
