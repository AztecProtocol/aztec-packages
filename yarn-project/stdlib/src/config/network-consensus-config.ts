import type { EnvVar } from '@aztec/foundation/config';

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

/**
 * Network-minimum per-block budget multiplier for DA gas / blob fields. See
 * {@link MIN_PER_BLOCK_ALLOCATION_MULTIPLIER}. The DA-specific operator knob and its runtime enforcement land
 * with the network tx admission limits (#23947); until then this only constrains the in-code presets.
 */
export const MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER = 1.5;

/**
 * Environment variables whose values must be identical across every node of a network. They fall into three
 * categories, all consensus-critical:
 *
 * - Timing/protocol consensus: slot and epoch durations, block sub-slot duration, max blocks per checkpoint, and
 *   the checkpoint-proposal materialization grace. Proposers and validators must agree on these to land on the
 *   same proposed chain and the same checkpoint-proposal receive/handoff deadlines.
 * - Network identity and L1-posted deployment params: the L1 chain id and the staking/governance/slashing
 *   parameters baked into the deployed rollup contract (committee size, lags, thresholds, mana target, fee
 *   pricing, governance/slashing round sizes, quorums, slash amounts, etc.). A node disagreeing with the rollup
 *   it points at would compute the wrong epoch geometry, fees, or slashing rounds.
 * - Node-side slashing offense consensus: the offense detection/penalty parameters validators apply locally to
 *   decide which payloads to sign. Validators must agree on these to reach the on-chain slashing quorum.
 *
 * Deliberately excluded: bootnodes, P2P/store/OTEL/sentinel settings, SEQ_MIN_TX_PER_BLOCK, SEQ_MAX_TX_PER_*,
 * AZTEC_SLASHER_ENABLED, PROVER_REAL_PROOFS, TRANSACTIONS_DISABLED, and AZTEC_ENTRY_QUEUE_* (mainnet-only genesis
 * params enforced by L1).
 */
export const NETWORK_CONSENSUS_ENV_VARS = [
  // Timing/protocol consensus.
  'ETHEREUM_SLOT_DURATION',
  'AZTEC_SLOT_DURATION',
  'AZTEC_EPOCH_DURATION',
  'SEQ_BLOCK_DURATION_MS',
  'MAX_BLOCKS_PER_CHECKPOINT',
  'CHECKPOINT_PROPOSAL_SYNC_GRACE_SECONDS',

  // Network identity / L1-posted deployment params.
  'L1_CHAIN_ID',
  'AZTEC_TARGET_COMMITTEE_SIZE',
  'AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET',
  'AZTEC_LAG_IN_EPOCHS_FOR_RANDAO',
  'AZTEC_ACTIVATION_THRESHOLD',
  'AZTEC_EJECTION_THRESHOLD',
  'AZTEC_LOCAL_EJECTION_THRESHOLD',
  'AZTEC_EXIT_DELAY_SECONDS',
  'AZTEC_INBOX_LAG',
  'AZTEC_PROOF_SUBMISSION_EPOCHS',
  'AZTEC_MANA_TARGET',
  'AZTEC_PROVING_COST_PER_MANA',
  'AZTEC_INITIAL_ETH_PER_FEE_ASSET',
  'AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE',
  'AZTEC_GOVERNANCE_PROPOSER_QUORUM',
  'AZTEC_SLASHING_QUORUM',
  'AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS',
  'AZTEC_SLASHING_LIFETIME_IN_ROUNDS',
  'AZTEC_SLASHING_OFFSET_IN_ROUNDS',
  'AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS',
  'AZTEC_SLASHING_VETOER',
  'AZTEC_SLASHING_DISABLE_DURATION',
  'AZTEC_SLASH_AMOUNT_SMALL',
  'AZTEC_SLASH_AMOUNT_MEDIUM',
  'AZTEC_SLASH_AMOUNT_LARGE',

  // Node-side slashing offense consensus.
  'SLASH_OFFENSE_EXPIRATION_ROUNDS',
  'SLASH_MAX_PAYLOAD_SIZE',
  'SLASH_EXECUTE_ROUNDS_LOOK_BACK',
  'SLASH_DATA_WITHHOLDING_TOLERANCE_SLOTS',
  'SLASH_DATA_WITHHOLDING_PENALTY',
  'SLASH_INACTIVITY_TARGET_PERCENTAGE',
  'SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD',
  'SLASH_INACTIVITY_PENALTY',
  'SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY',
  'SLASH_DUPLICATE_PROPOSAL_PENALTY',
  'SLASH_DUPLICATE_ATTESTATION_PENALTY',
  'SLASH_PROPOSE_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS_PENALTY',
  'SLASH_ATTEST_INVALID_CHECKPOINT_PROPOSAL_PENALTY',
  'SLASH_UNKNOWN_PENALTY',
  'SLASH_INVALID_BLOCK_PENALTY',
  'SLASH_INVALID_CHECKPOINT_PROPOSAL_PENALTY',
  'SLASH_GRACE_PERIOD_L2_SLOTS',
] as const satisfies readonly EnvVar[];

/** A consensus-critical environment variable name; see {@link NETWORK_CONSENSUS_ENV_VARS}. */
export type ConsensusEnvVar = (typeof NETWORK_CONSENSUS_ENV_VARS)[number];

/** The subset of consensus-critical timing config whose geometry can be validated in isolation. */
export type NetworkConsensusConfig = {
  /** Aztec L2 slot duration in seconds. */
  aztecSlotDuration: number;
  /** Ethereum L1 slot duration in seconds. */
  ethereumSlotDuration: number;
  /** Duration of a block sub-slot in milliseconds. */
  blockDurationMs: number;
  /** Explicit network max blocks per checkpoint (the value the production default budgets must derive). */
  maxBlocksPerCheckpoint: number;
  /** Consensus grace for received checkpoint proposals to materialize locally, in seconds. */
  checkpointProposalSyncGraceSeconds: number;
};

/**
 * Extracts the timing {@link NetworkConsensusConfig} from a generated network config object. Reads the relevant
 * env-var keys and coerces them with `Number()`; missing keys become `NaN`, which
 * {@link validateNetworkConsensusConfig} reports as an error.
 */
export function getConsensusConfigFromNetworkEnv(
  values: Record<string, string | number | boolean>,
): NetworkConsensusConfig {
  return {
    aztecSlotDuration: Number(values['AZTEC_SLOT_DURATION']),
    ethereumSlotDuration: Number(values['ETHEREUM_SLOT_DURATION']),
    blockDurationMs: Number(values['SEQ_BLOCK_DURATION_MS']),
    maxBlocksPerCheckpoint: Number(values['MAX_BLOCKS_PER_CHECKPOINT']),
    checkpointProposalSyncGraceSeconds: Number(values['CHECKPOINT_PROPOSAL_SYNC_GRACE_SECONDS']),
  };
}

/**
 * Validates a {@link NetworkConsensusConfig} for self-consistency, returning a list of error messages (empty
 * when valid). Used by the cli unit test that gates the generated network configs.
 *
 * The check requires `maxBlocksPerCheckpoint` to be *exactly* what a {@link ProposerTimetable} built from the
 * same slot timings and the production default budgets derives. This exact-equality requirement ensures the
 * published network value is precisely what the production default budgets produce, so every node running those
 * defaults agrees on the per-checkpoint block count without clamping.
 */
export function validateNetworkConsensusConfig(config: NetworkConsensusConfig): string[] {
  const errors: string[] = [];

  for (const [field, value] of Object.entries(config)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${field} must be a finite number (got ${value})`);
    }
  }
  if (errors.length > 0) {
    return errors;
  }

  if (config.ethereumSlotDuration <= 0) {
    errors.push(`ethereumSlotDuration must be positive (got ${config.ethereumSlotDuration})`);
  }
  if (config.blockDurationMs <= 0) {
    errors.push(`blockDurationMs must be positive (got ${config.blockDurationMs})`);
  }
  if (config.aztecSlotDuration <= 0) {
    errors.push(`aztecSlotDuration must be positive (got ${config.aztecSlotDuration})`);
  }
  if (config.ethereumSlotDuration > 0 && config.aztecSlotDuration % config.ethereumSlotDuration !== 0) {
    errors.push(
      `aztecSlotDuration (${config.aztecSlotDuration}s) must be a multiple of ethereumSlotDuration ` +
        `(${config.ethereumSlotDuration}s)`,
    );
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
  if (errors.length > 0) {
    return errors;
  }

  let computed: number;
  try {
    computed = new ProposerTimetable({
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
  } catch (err) {
    // The timetable constructor throws when not even one block fits the default budgets; report instead.
    errors.push(
      `maxBlocksPerCheckpoint (${config.maxBlocksPerCheckpoint}) cannot be achieved: the default operational ` +
        `budgets fit fewer than one block for slot duration ${config.aztecSlotDuration}s and block duration ` +
        `${config.blockDurationMs / 1000}s (${err instanceof Error ? err.message : String(err)})`,
    );
    return errors;
  }

  if (computed !== config.maxBlocksPerCheckpoint) {
    errors.push(
      `maxBlocksPerCheckpoint (${config.maxBlocksPerCheckpoint}) does not match the ${computed} blocks the ` +
        `production default budgets derive for slot duration ${config.aztecSlotDuration}s and block duration ` +
        `${config.blockDurationMs / 1000}s`,
    );
  }

  return errors;
}

/**
 * Enforces that operators do not silently override consensus-critical values diverging from the network config.
 *
 * For each var in {@link NETWORK_CONSENSUS_ENV_VARS} present in `networkConfig`: if the operator set it in `env`
 * to a conflicting value, this throws unless `ALLOW_OVERRIDING_NETWORK_CONFIG` is truthy (in which case it logs
 * and keeps the operator value). On a numeric match, the env value is canonicalized to the network value's
 * string form. This function does not populate unset vars (the caller's enrichment loop does that) and never
 * touches `NETWORK`.
 */
export function checkConsensusEnvOverrides(
  networkConfig: Record<string, string | number | boolean>,
  env: { [key: string]: string | undefined } = process.env,
  log?: (msg: string) => void,
): void {
  const allowOverride = allowsNetworkConfigOverride(env);

  for (const envVar of NETWORK_CONSENSUS_ENV_VARS) {
    const networkValue = networkConfig[envVar];
    if (networkValue === undefined) {
      continue;
    }

    const current = env[envVar];
    if (current === undefined || current === '') {
      continue;
    }

    const networkIsNumeric = typeof networkValue === 'number';
    const matches = networkIsNumeric ? Number(current) === networkValue : current === String(networkValue);
    if (matches) {
      // Canonicalize numeric matches: the config layer parses some vars with parseInt, which reads '6e3' as 6.
      // Rewriting to the network value's string form closes that bypass.
      if (networkIsNumeric) {
        env[envVar] = String(networkValue);
      }
      continue;
    }

    const message =
      `Environment variable ${envVar}=${current} conflicts with the network value ${networkValue}. ` +
      `Consensus-critical values must match across the network. Set ALLOW_OVERRIDING_NETWORK_CONFIG=1 to override ` +
      `(only do this if you know what you are doing).`;
    if (allowOverride) {
      log?.(message);
      continue;
    }
    throw new Error(message);
  }
}

/** Whether the env opts into overriding network-wide consensus values (`ALLOW_OVERRIDING_NETWORK_CONFIG`). */
export function allowsNetworkConfigOverride(env: { [key: string]: string | undefined } = process.env): boolean {
  const value = env.ALLOW_OVERRIDING_NETWORK_CONFIG;
  return value === '1' || value?.toLowerCase() === 'true';
}
