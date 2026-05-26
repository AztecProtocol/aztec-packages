import { DEFAULT_MAX_DEBUG_LOG_MEMORY_READS } from '@aztec/constants';
import { type ConfigMappingsType, numberConfigHelper } from '@aztec/foundation/config';

/** Config for the Aztec node URL, shared across clients that connect to an Aztec node. */
export interface NodeUrlConfig {
  /** The URL of the Aztec node to connect to. */
  nodeUrl: string;
}

export const nodeUrlConfigMappings: ConfigMappingsType<NodeUrlConfig> = {
  nodeUrl: {
    env: 'AZTEC_NODE_URL',
    description: 'The URL of the Aztec node to connect to.',
  },
};

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
};
