import { describe, expect, it } from '@jest/globals';

import { type NodeRPCConfig, getRpcCorsAllowedOrigins } from './node-rpc-config.js';

describe('Node RPC config', () => {
  it('accepts the legacy config shape and preserves default CORS behavior', () => {
    const config: NodeRPCConfig = {
      rpcSimulatePublicMaxGasLimit: 1,
      rpcSimulatePublicMaxDebugLogMemoryReads: 1,
      rpcMaxBatchSize: 100,
      rpcMaxBodySize: '1mb',
    };

    expect(getRpcCorsAllowedOrigins(config)).toEqual([]);
  });
});
