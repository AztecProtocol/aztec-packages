import { l1ContractsConfigMappings } from '@aztec/ethereum/config';

import { MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT } from '../deserialization/index.js';
import { MIN_BLOCKS_FOR_INBOX_CATCHUP } from '../messaging/inbox_consumption.js';
import {
  NETWORK_CONSENSUS_ENV_VARS,
  type NetworkConsensusConfig,
  checkConsensusEnvOverrides,
  getConsensusConfigFromNetworkEnv,
  validateNetworkConsensusConfig,
} from './network-consensus-config.js';
import { sharedSequencerConfigMappings } from './sequencer-config.js';

describe('validateNetworkConsensusConfig', () => {
  // Production geometry: the default budgets derive exactly 10 blocks per checkpoint.
  const base: NetworkConsensusConfig = {
    aztecSlotDuration: 72,
    ethereumSlotDuration: 12,
    blockDurationMs: 6000,
    maxBlocksPerCheckpoint: 10,
    checkpointProposalSyncGraceSeconds: 12,
  };

  it('returns no errors for a sound config', () => {
    expect(validateNetworkConsensusConfig(base)).toEqual([]);
  });

  it('errors when maxBlocksPerCheckpoint is below the derived count, naming both numbers', () => {
    const errors = validateNetworkConsensusConfig({ ...base, maxBlocksPerCheckpoint: 9 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('9');
    expect(errors[0]).toContain('10');
  });

  it('errors when maxBlocksPerCheckpoint is above the derived count, naming both numbers', () => {
    const errors = validateNetworkConsensusConfig({ ...base, maxBlocksPerCheckpoint: 11 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('11');
    expect(errors[0]).toContain('10');
  });

  // A long slot with short sub-slots derives more blocks than a node will build or attest to, so the network
  // would accept a geometry whose later block indices p2p and checkpoint validation both reject.
  it('errors when the derived count exceeds the attestable ceiling', () => {
    const errors = validateNetworkConsensusConfig({
      ...base,
      aztecSlotDuration: 96,
      blockDurationMs: 1000,
      maxBlocksPerCheckpoint: 89,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('89');
    expect(errors[0]).toContain(String(MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT));
  });

  it('accepts a config sitting exactly on the attestable ceiling', () => {
    expect(
      validateNetworkConsensusConfig({ ...base, maxBlocksPerCheckpoint: MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT }),
    ).not.toContainEqual(expect.stringContaining('exceeds the'));
  });

  it('derives the streaming-Inbox catch-up floor from the message caps', () => {
    // ceil(1024 / 256) = 4 for the current caps: blocks consume message prefixes, so each carries a full block cap.
    expect(MIN_BLOCKS_FOR_INBOX_CATCHUP).toBe(4);
  });

  it('rejects a maxBlocksPerCheckpoint below the streaming-Inbox catch-up floor', () => {
    // A 36s slot with 8s blocks derives 2 blocks per checkpoint, so the derived-count check passes while the
    // network remains permanently haltable by a mandatory backlog no checkpoint can clear.
    const errors = validateNetworkConsensusConfig({
      ...base,
      aztecSlotDuration: 36,
      blockDurationMs: 8000,
      maxBlocksPerCheckpoint: 2,
      checkpointProposalSyncGraceSeconds: 12,
    });
    expect(errors).toEqual([expect.stringContaining(`at least ${MIN_BLOCKS_FOR_INBOX_CATCHUP}`)]);
    expect(errors[0]).toContain('2');
  });

  it('accepts a maxBlocksPerCheckpoint exactly at the catch-up floor', () => {
    // A 36s slot with 6s blocks derives exactly 4 blocks: floor((36 - 1 - 6 - 4 - 1) / 6).
    expect(
      validateNetworkConsensusConfig({
        ...base,
        aztecSlotDuration: 36,
        maxBlocksPerCheckpoint: MIN_BLOCKS_FOR_INBOX_CATCHUP,
        checkpointProposalSyncGraceSeconds: 12,
      }),
    ).toEqual([]);
  });

  it('errors when the slot duration is not a multiple of the ethereum slot duration', () => {
    expect(validateNetworkConsensusConfig({ ...base, ethereumSlotDuration: 5 })).toContainEqual(
      expect.stringContaining('must be a multiple'),
    );
  });

  it('errors when blockDurationMs is non-positive', () => {
    expect(validateNetworkConsensusConfig({ ...base, blockDurationMs: 0 })).toContainEqual(
      expect.stringContaining('blockDurationMs'),
    );
  });

  it('errors when the sub-slot is longer than the slot', () => {
    expect(validateNetworkConsensusConfig({ ...base, blockDurationMs: 100_000 })).toContainEqual(
      expect.stringContaining('exceeds aztecSlotDuration'),
    );
  });

  it('errors for a non-finite value', () => {
    expect(validateNetworkConsensusConfig({ ...base, blockDurationMs: NaN })).toContainEqual(
      expect.stringContaining('blockDurationMs'),
    );
  });

  it('errors when a field is missing (NaN from Number(undefined))', () => {
    expect(
      validateNetworkConsensusConfig({ ...base, maxBlocksPerCheckpoint: undefined as unknown as number }),
    ).toContainEqual(expect.stringContaining('maxBlocksPerCheckpoint'));
  });

  it('errors rather than throws when fewer than one block fits the default budgets', () => {
    // 60s blocks pass the sub-slot <= slot check, but the default budgets fit < 1 block.
    const errors = validateNetworkConsensusConfig({ ...base, blockDurationMs: 60_000 });
    expect(errors).not.toEqual([]);
    expect(errors[0]).toContain('cannot be achieved');
  });
});

describe('getConsensusConfigFromNetworkEnv', () => {
  it('extracts the five timing fields from a generated-config-shaped object', () => {
    const config = getConsensusConfigFromNetworkEnv({
      ETHEREUM_SLOT_DURATION: 12,
      AZTEC_SLOT_DURATION: 72,
      SEQ_BLOCK_DURATION_MS: 6000,
      MAX_BLOCKS_PER_CHECKPOINT: 10,
      CHECKPOINT_PROPOSAL_SYNC_GRACE_SECONDS: 12,
      L1_CHAIN_ID: 1,
    });
    expect(config).toEqual({
      aztecSlotDuration: 72,
      ethereumSlotDuration: 12,
      blockDurationMs: 6000,
      maxBlocksPerCheckpoint: 10,
      checkpointProposalSyncGraceSeconds: 12,
    });
  });

  it('uses env names that are all consensus-critical', () => {
    const pickedEnvNames = [
      l1ContractsConfigMappings.aztecSlotDuration.env,
      l1ContractsConfigMappings.ethereumSlotDuration.env,
      sharedSequencerConfigMappings.blockDurationMs.env,
      sharedSequencerConfigMappings.maxBlocksPerCheckpoint.env,
      sharedSequencerConfigMappings.checkpointProposalSyncGraceSeconds.env,
    ];
    for (const env of pickedEnvNames) {
      expect(NETWORK_CONSENSUS_ENV_VARS).toContain(env);
    }
  });
});

describe('checkConsensusEnvOverrides', () => {
  const networkConfig = {
    SEQ_BLOCK_DURATION_MS: 6000,
    AZTEC_SLASHING_VETOER: '0x0000000000000000000000000000000000000000',
    L1_CHAIN_ID: 1,
  };

  it('returns no canonical writes for unset vars', () => {
    const env: Record<string, string | undefined> = {};
    expect(checkConsensusEnvOverrides(networkConfig, env)).toEqual({});
    expect(env.SEQ_BLOCK_DURATION_MS).toBeUndefined();
    expect(env.L1_CHAIN_ID).toBeUndefined();
  });

  it('returns the canonical form of a numerically-equal value without mutating env', () => {
    const env: Record<string, string | undefined> = { SEQ_BLOCK_DURATION_MS: '6e3' };
    const canonical = checkConsensusEnvOverrides(networkConfig, env);
    expect(canonical).toEqual({ SEQ_BLOCK_DURATION_MS: '6000' });
    // The check itself is pure: env is untouched.
    expect(env.SEQ_BLOCK_DURATION_MS).toBe('6e3');
  });

  it('throws naming the var on a conflicting value', () => {
    const env: Record<string, string | undefined> = { SEQ_BLOCK_DURATION_MS: '3000' };
    expect(() => checkConsensusEnvOverrides(networkConfig, env)).toThrow(/SEQ_BLOCK_DURATION_MS/);
  });

  it('keeps the operator value and logs when ALLOW_OVERRIDING_NETWORK_CONFIG is set', () => {
    const env: Record<string, string | undefined> = {
      SEQ_BLOCK_DURATION_MS: '3000',
      ALLOW_OVERRIDING_NETWORK_CONFIG: '1',
    };
    const logs: string[] = [];
    const canonical = checkConsensusEnvOverrides(networkConfig, env, msg => logs.push(msg));
    // A genuine override is not canonicalized: the operator value is kept and absent from the writes.
    expect(canonical).toEqual({});
    expect(env.SEQ_BLOCK_DURATION_MS).toBe('3000');
    expect(logs.some(msg => msg.includes('SEQ_BLOCK_DURATION_MS'))).toBe(true);
  });

  it('compares non-numeric values as strings', () => {
    const matching: Record<string, string | undefined> = {
      AZTEC_SLASHING_VETOER: '0x0000000000000000000000000000000000000000',
    };
    // Non-numeric values are never canonicalized, so no writes are returned.
    expect(checkConsensusEnvOverrides(networkConfig, matching)).toEqual({});
    expect(matching.AZTEC_SLASHING_VETOER).toBe('0x0000000000000000000000000000000000000000');

    const conflicting: Record<string, string | undefined> = {
      AZTEC_SLASHING_VETOER: '0xdfe19Da6a717b7088621d8bBB66be59F2d78e924',
    };
    expect(() => checkConsensusEnvOverrides(networkConfig, conflicting)).toThrow(/AZTEC_SLASHING_VETOER/);
  });

  it('ignores vars absent from the network config', () => {
    const env: Record<string, string | undefined> = { AZTEC_SLASHING_QUORUM: '99' };
    expect(checkConsensusEnvOverrides(networkConfig, env)).toEqual({});
    expect(env.AZTEC_SLASHING_QUORUM).toBe('99');
  });
});
