import { DEFAULT_MAX_DEBUG_LOG_MEMORY_READS } from '@aztec/constants';
import { type ConfigMappingsType, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';

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
  rpcCorsAllowedOrigins: {
    env: 'RPC_CORS_ALLOWED_ORIGINS',
    description: 'Origins allowed to make credentialed cross-origin JSON RPC requests, separated by commas.',
    parseEnv: (value: string) =>
      value
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean),
    defaultValue: [],
  },
  rpcCorsAllowAnyOrigin: {
    env: 'RPC_CORS_ALLOW_ANY_ORIGIN',
    description: 'Allow credentialed cross-origin JSON RPC requests from any origin.',
    ...booleanConfigHelper(false),
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
  /** Origins allowed to make credentialed cross-origin requests to the RPC server. */
  rpcCorsAllowedOrigins?: string[];
  /** Whether to allow credentialed cross-origin requests from any origin. */
  rpcCorsAllowAnyOrigin?: boolean;
};

/** Resolves the CORS origin policy for an RPC server. */
export function getRpcCorsAllowedOrigins(
  config: Pick<NodeRPCConfig, 'rpcCorsAllowedOrigins' | 'rpcCorsAllowAnyOrigin'>,
): string[] {
  return config.rpcCorsAllowAnyOrigin ? ['*'] : (config.rpcCorsAllowedOrigins ?? []);
}
