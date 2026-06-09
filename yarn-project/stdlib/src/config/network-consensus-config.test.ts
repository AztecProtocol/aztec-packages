import type { NetworkNames } from '@aztec/foundation/config';

import {
  type NetworkConsensusConfig,
  applyNetworkConsensusConfigToEnv,
  getNetworkConsensusConfig,
  validateNetworkConsensusConfig,
} from './network-consensus-config.js';

const PRESET_NETWORKS: NetworkNames[] = ['mainnet', 'testnet'];

describe('NetworkConsensusConfig presets', () => {
  it.each(PRESET_NETWORKS)('%s preset validates with zero errors and zero warnings', networkName => {
    const preset = getNetworkConsensusConfig(networkName);
    expect(preset).toBeDefined();
    const { errors, warnings } = validateNetworkConsensusConfig(preset!);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('returns undefined for networks without a preset', () => {
    expect(getNetworkConsensusConfig('local')).toBeUndefined();
    expect(getNetworkConsensusConfig('devnet')).toBeUndefined();
  });
});

describe('validateNetworkConsensusConfig', () => {
  const base: NetworkConsensusConfig = {
    aztecSlotDuration: 72,
    ethereumSlotDuration: 12,
    blockDurationMs: 6000,
    maxBlocksPerCheckpoint: 10,
    checkpointProposalSyncGraceSeconds: 12,
    minPerBlockAllocationMultiplier: 1.2,
    minPerBlockDAAllocationMultiplier: 1.5,
  };

  it('reports an error when blockDurationMs is non-positive', () => {
    expect(validateNetworkConsensusConfig({ ...base, blockDurationMs: 0 }).errors).toContainEqual(
      expect.stringContaining('blockDurationMs'),
    );
  });

  it('reports an error when the sub-slot is longer than the slot', () => {
    expect(validateNetworkConsensusConfig({ ...base, blockDurationMs: 100_000 }).errors).toContainEqual(
      expect.stringContaining('exceeds aztecSlotDuration'),
    );
  });

  it('reports an error when maxBlocksPerCheckpoint is below 1', () => {
    expect(validateNetworkConsensusConfig({ ...base, maxBlocksPerCheckpoint: 0 }).errors).toContainEqual(
      expect.stringContaining('maxBlocksPerCheckpoint'),
    );
  });

  it('reports an error for a negative sync grace', () => {
    expect(validateNetworkConsensusConfig({ ...base, checkpointProposalSyncGraceSeconds: -1 }).errors).toContainEqual(
      expect.stringContaining('checkpointProposalSyncGraceSeconds'),
    );
  });

  it('reports an error for multipliers below 1', () => {
    expect(validateNetworkConsensusConfig({ ...base, minPerBlockAllocationMultiplier: 0.5 }).errors).toContainEqual(
      expect.stringContaining('minPerBlockAllocationMultiplier'),
    );
    expect(validateNetworkConsensusConfig({ ...base, minPerBlockDAAllocationMultiplier: 0.5 }).errors).toContainEqual(
      expect.stringContaining('minPerBlockDAAllocationMultiplier'),
    );
  });

  it('warns when the slot duration is not a multiple of the ethereum slot duration', () => {
    expect(validateNetworkConsensusConfig({ ...base, ethereumSlotDuration: 5 }).warnings).toContainEqual(
      expect.stringContaining('not a multiple'),
    );
  });

  it('warns when maxBlocksPerCheckpoint exceeds the achievable count at default budgets', () => {
    expect(validateNetworkConsensusConfig({ ...base, maxBlocksPerCheckpoint: 24 }).warnings).toContainEqual(
      expect.stringContaining('exceeds the'),
    );
  });
});

describe('applyNetworkConsensusConfigToEnv', () => {
  const mainnet = getNetworkConsensusConfig('mainnet')!;

  it('populates unset consensus vars from the preset', () => {
    const env: Record<string, string | undefined> = {};
    applyNetworkConsensusConfigToEnv('mainnet', env);
    expect(env.ETHEREUM_SLOT_DURATION).toBe(String(mainnet.ethereumSlotDuration));
    expect(env.SEQ_BLOCK_DURATION_MS).toBe(String(mainnet.blockDurationMs));
    expect(env.MAX_BLOCKS_PER_CHECKPOINT).toBe(String(mainnet.maxBlocksPerCheckpoint));
    expect(env.CHECKPOINT_PROPOSAL_SYNC_GRACE_SECONDS).toBe(String(mainnet.checkpointProposalSyncGraceSeconds));
  });

  it('keeps equal operator values', () => {
    const env: Record<string, string | undefined> = { SEQ_BLOCK_DURATION_MS: String(mainnet.blockDurationMs) };
    expect(() => applyNetworkConsensusConfigToEnv('mainnet', env)).not.toThrow();
    expect(env.SEQ_BLOCK_DURATION_MS).toBe(String(mainnet.blockDurationMs));
  });

  it('throws naming the var on a conflicting operator override', () => {
    const env: Record<string, string | undefined> = { SEQ_BLOCK_DURATION_MS: '3000' };
    expect(() => applyNetworkConsensusConfigToEnv('mainnet', env)).toThrow(/SEQ_BLOCK_DURATION_MS/);
  });

  it('keeps the operator value and logs when ALLOW_OVERRIDING_NETWORK_CONFIG is set', () => {
    const env: Record<string, string | undefined> = {
      SEQ_BLOCK_DURATION_MS: '3000',
      ALLOW_OVERRIDING_NETWORK_CONFIG: '1',
    };
    const logs: string[] = [];
    applyNetworkConsensusConfigToEnv('mainnet', env, msg => logs.push(msg));
    expect(env.SEQ_BLOCK_DURATION_MS).toBe('3000');
    expect(logs.some(msg => msg.includes('SEQ_BLOCK_DURATION_MS'))).toBe(true);
  });

  it('is a no-op for networks without a preset', () => {
    const env: Record<string, string | undefined> = {};
    applyNetworkConsensusConfigToEnv('local', env);
    expect(env).toEqual({});
  });
});
