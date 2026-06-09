import type { NetworkNames } from '@aztec/foundation/config';

import {
  DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME,
  DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
  DEFAULT_MIN_BLOCK_DURATION,
  DEFAULT_P2P_PROPAGATION_TIME,
} from '../timetable/budgets.js';
import { ProposerTimetable } from '../timetable/proposer_timetable.js';

/**
 * Network-minimum per-block budget multiplier for L2 gas / tx count. Operators may configure a higher value,
 * but never lower: a node admitting txs under a smaller multiplier would accept work it can never pack.
 */
export const MIN_PER_BLOCK_ALLOCATION_MULTIPLIER = 1.2;

/** Network-minimum per-block budget multiplier for DA gas / blob fields. See {@link MIN_PER_BLOCK_ALLOCATION_MULTIPLIER}. */
export const MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER = 1.5;

/** Consensus-critical configuration that must be identical across all nodes of a network. */
export type NetworkConsensusConfig = {
  /** Expected aztecSlotDuration (seconds); cross-checked against the rollup contract at startup. */
  aztecSlotDuration: number;
  /** Ethereum slot duration (seconds) of the network's L1. */
  ethereumSlotDuration: number;
  /** Duration of a block sub-slot in ms. */
  blockDurationMs: number;
  /** Explicit network max blocks per checkpoint (NOT derived from local budgets). */
  maxBlocksPerCheckpoint: number;
  /** Consensus grace for received checkpoint proposals to materialize locally (seconds). */
  checkpointProposalSyncGraceSeconds: number;
  /** Network-minimum per-block budget multiplier for L2 gas / tx count (operators may set higher). */
  minPerBlockAllocationMultiplier: number;
  /** Network-minimum per-block budget multiplier for DA gas / blob fields. */
  minPerBlockDAAllocationMultiplier: number;
};

/**
 * In-code consensus presets keyed by network name. Networks without a preset (e.g. `local`, `devnet`) return
 * `undefined` from {@link getNetworkConsensusConfig} and are not subject to override enforcement.
 */
const NETWORK_CONSENSUS_PRESETS: Partial<Record<NetworkNames, NetworkConsensusConfig>> = {
  mainnet: {
    aztecSlotDuration: 72,
    ethereumSlotDuration: 12,
    blockDurationMs: 6000,
    maxBlocksPerCheckpoint: 10,
    checkpointProposalSyncGraceSeconds: 12,
    minPerBlockAllocationMultiplier: MIN_PER_BLOCK_ALLOCATION_MULTIPLIER,
    minPerBlockDAAllocationMultiplier: MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER,
  },
  testnet: {
    aztecSlotDuration: 72,
    ethereumSlotDuration: 12,
    blockDurationMs: 6000,
    maxBlocksPerCheckpoint: 10,
    checkpointProposalSyncGraceSeconds: 12,
    minPerBlockAllocationMultiplier: MIN_PER_BLOCK_ALLOCATION_MULTIPLIER,
    minPerBlockDAAllocationMultiplier: MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER,
  },
};

/** Returns the in-code consensus preset for a network, or `undefined` when none is defined. */
export function getNetworkConsensusConfig(networkName: NetworkNames): NetworkConsensusConfig | undefined {
  return NETWORK_CONSENSUS_PRESETS[networkName];
}

/** Maps consensus config fields to the env vars operators may set for them. */
const CONSENSUS_ENV_VARS = [
  { env: 'ETHEREUM_SLOT_DURATION', field: 'ethereumSlotDuration' },
  { env: 'SEQ_BLOCK_DURATION_MS', field: 'blockDurationMs' },
  { env: 'MAX_BLOCKS_PER_CHECKPOINT', field: 'maxBlocksPerCheckpoint' },
  { env: 'CHECKPOINT_PROPOSAL_SYNC_GRACE_SECONDS', field: 'checkpointProposalSyncGraceSeconds' },
] as const satisfies ReadonlyArray<{ env: string; field: keyof NetworkConsensusConfig }>;

/**
 * Validates a {@link NetworkConsensusConfig} for self-consistency, independent of any node's local budgets.
 *
 * Errors are conditions that make the config impossible (non-positive durations, sub-slot longer than the
 * slot, fewer than one block per checkpoint, negative grace, multipliers below 1). Warnings are conditions
 * that are merely suspicious or unachievable at the production operational budgets: a non-divisible
 * slot/ethereum-slot ratio, or a `maxBlocksPerCheckpoint` exceeding what a {@link ProposerTimetable} built
 * from the same slot timings and the default budgets can achieve.
 */
export function validateNetworkConsensusConfig(config: NetworkConsensusConfig): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.ethereumSlotDuration <= 0) {
    errors.push(`ethereumSlotDuration must be positive (got ${config.ethereumSlotDuration})`);
  }
  if (config.blockDurationMs <= 0) {
    errors.push(`blockDurationMs must be positive (got ${config.blockDurationMs})`);
  }
  if (config.blockDurationMs / 1000 > config.aztecSlotDuration) {
    errors.push(
      `blockDurationMs (${config.blockDurationMs}ms) exceeds aztecSlotDuration (${config.aztecSlotDuration}s)`,
    );
  }
  if (config.maxBlocksPerCheckpoint < 1) {
    errors.push(`maxBlocksPerCheckpoint must be at least 1 (got ${config.maxBlocksPerCheckpoint})`);
  }
  if (config.checkpointProposalSyncGraceSeconds < 0) {
    errors.push(
      `checkpointProposalSyncGraceSeconds must be non-negative (got ${config.checkpointProposalSyncGraceSeconds})`,
    );
  }
  if (config.minPerBlockAllocationMultiplier < 1) {
    errors.push(`minPerBlockAllocationMultiplier must be at least 1 (got ${config.minPerBlockAllocationMultiplier})`);
  }
  if (config.minPerBlockDAAllocationMultiplier < 1) {
    errors.push(
      `minPerBlockDAAllocationMultiplier must be at least 1 (got ${config.minPerBlockDAAllocationMultiplier})`,
    );
  }

  if (config.ethereumSlotDuration > 0 && config.aztecSlotDuration % config.ethereumSlotDuration !== 0) {
    warnings.push(
      `aztecSlotDuration (${config.aztecSlotDuration}s) is not a multiple of ethereumSlotDuration ` +
        `(${config.ethereumSlotDuration}s)`,
    );
  }

  // Achievability check: a config whose maxBlocksPerCheckpoint exceeds what the production operational budgets
  // can pack is a warning rather than an error, since the default MAX_BLOCKS_PER_CHECKPOINT combined with local
  // geometry routinely exceeds achievable and local/sandbox startup must not break.
  if (errors.length === 0) {
    const achievable = new ProposerTimetable({
      l1Constants: {
        l1GenesisTime: 0n,
        slotDuration: config.aztecSlotDuration,
        ethereumSlotDuration: config.ethereumSlotDuration,
      },
      blockDuration: config.blockDurationMs / 1000,
      minBlockDuration: DEFAULT_MIN_BLOCK_DURATION,
      p2pPropagationTime: DEFAULT_P2P_PROPAGATION_TIME,
      checkpointProposalPrepareTime: DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
      checkpointProposalInitTime: DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME,
      checkpointProposalSyncGrace: config.checkpointProposalSyncGraceSeconds,
    }).getMaxBlocksPerCheckpoint();
    if (config.maxBlocksPerCheckpoint > achievable) {
      warnings.push(
        `maxBlocksPerCheckpoint (${config.maxBlocksPerCheckpoint}) exceeds the ${achievable} blocks achievable ` +
          `with the default operational budgets for slot duration ${config.aztecSlotDuration}s and block ` +
          `duration ${config.blockDurationMs / 1000}s`,
      );
    }
  }

  return { errors, warnings };
}

/**
 * Writes a network's consensus preset into the given env, enforcing that operators do not silently override
 * consensus-critical values.
 *
 * For each enforced env var: if it is set to a value numerically different from the preset, this throws unless
 * `ALLOW_OVERRIDING_NETWORK_CONFIG` is truthy (in which case it warns and keeps the operator's value). If it is
 * unset or already equal, the preset value is written into the env. No-op for networks without a preset.
 */
export function applyNetworkConsensusConfigToEnv(
  networkName: NetworkNames,
  env: { [key: string]: string | undefined } = process.env,
  log?: (msg: string) => void,
): void {
  const preset = getNetworkConsensusConfig(networkName);
  if (!preset) {
    return;
  }

  const allowOverride = isTruthyEnv(env.ALLOW_OVERRIDING_NETWORK_CONFIG);

  for (const { env: envVar, field } of CONSENSUS_ENV_VARS) {
    const presetValue = preset[field];
    const current = env[envVar];

    if (current !== undefined && current !== '') {
      const parsed = Number(current);
      if (!Number.isNaN(parsed) && parsed === presetValue) {
        continue;
      }
      const message =
        `Environment variable ${envVar}=${current} conflicts with the ${networkName} network value ${presetValue}. ` +
        `Consensus-critical values must match across the network. Set ALLOW_OVERRIDING_NETWORK_CONFIG=1 to override ` +
        `(only do this if you know what you are doing).`;
      if (allowOverride) {
        log?.(message);
        continue;
      }
      throw new Error(message);
    }

    env[envVar] = String(presetValue);
  }
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}
