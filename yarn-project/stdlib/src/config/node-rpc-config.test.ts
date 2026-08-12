import { describe, expect, it } from '@jest/globals';

import { getConfigFromMappings } from '@aztec/foundation/config';

import {
  DEFAULT_RPC_UNSEEN_BLOCK_BY_HASH_WAIT_MS,
  type NodeRPCConfig,
  getRpcCorsAllowedOrigins,
  nodeRpcConfigMappings,
} from './node-rpc-config.js';

describe('Node RPC config', () => {
  it('accepts the legacy config shape and preserves default CORS behavior', () => {
    const config: NodeRPCConfig = {
      rpcSimulatePublicMaxGasLimit: 1,
      rpcSimulatePublicMaxDebugLogMemoryReads: 1,
      rpcMaxBatchSize: 100,
      rpcMaxBodySize: '1mb',
      rpcUnseenBlockByHashWaitMs: DEFAULT_RPC_UNSEEN_BLOCK_BY_HASH_WAIT_MS,
    };

    expect(getRpcCorsAllowedOrigins(config)).toEqual([]);
  });
});

describe('nodeRpcConfigMappings', () => {
  const envKeys = ['RPC_UNSEEN_BLOCK_BY_NUMBER_WAIT_MS', 'RPC_UNSEEN_BLOCK_BY_HASH_WAIT_MS'] as const;
  let savedEnv: Record<string, string | undefined>;

  const getConfig = (env: Partial<Record<(typeof envKeys)[number], string>>): NodeRPCConfig => {
    for (const key of envKeys) {
      const value = env[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return getConfigFromMappings(nodeRpcConfigMappings);
  };

  beforeEach(() => {
    savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('leaves the by-number wait undefined when unset, so the node can default it to twice the block duration', () => {
    expect(getConfig({}).rpcUnseenBlockByNumberWaitMs).toBeUndefined();
  });

  it('defaults the by-hash wait when unset', () => {
    expect(getConfig({}).rpcUnseenBlockByHashWaitMs).toEqual(DEFAULT_RPC_UNSEEN_BLOCK_BY_HASH_WAIT_MS);
  });

  it('parses an explicit zero as zero rather than dropping it', () => {
    // Zero is how an operator disables the hold-off, so it must survive parsing as a number and not fall back
    // to the default or to undefined.
    const config = getConfig({
      RPC_UNSEEN_BLOCK_BY_NUMBER_WAIT_MS: '0',
      RPC_UNSEEN_BLOCK_BY_HASH_WAIT_MS: '0',
    });

    expect(config.rpcUnseenBlockByNumberWaitMs).toEqual(0);
    expect(config.rpcUnseenBlockByHashWaitMs).toEqual(0);
  });

  it('parses explicit waits', () => {
    const config = getConfig({
      RPC_UNSEEN_BLOCK_BY_NUMBER_WAIT_MS: '4500',
      RPC_UNSEEN_BLOCK_BY_HASH_WAIT_MS: '1500',
    });

    expect(config.rpcUnseenBlockByNumberWaitMs).toEqual(4500);
    expect(config.rpcUnseenBlockByHashWaitMs).toEqual(1500);
  });
});
