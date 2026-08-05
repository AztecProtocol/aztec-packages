import { type L1ContractsConfig, l1ContractsConfigMappings, validateSlotDurations } from '@aztec/ethereum/config';
import { type EnvVar, pickConfigMappings } from '@aztec/foundation/config';

import { MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT } from '../deserialization/index.js';
import type { SequencerConfig } from '../interfaces/configs.js';
import { MIN_BLOCKS_FOR_INBOX_CATCHUP } from '../messaging/inbox_consumption.js';
import {
  DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME,
  DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
  DEFAULT_MIN_BLOCK_DURATION,
  DEFAULT_P2P_PROPAGATION_TIME,
} from '../timetable/budgets.js';
import { ProposerTimetable } from '../timetable/proposer_timetable.js';
import { sharedSequencerConfigMappings } from './sequencer-config.js';

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

/**
 * The subset of consensus-critical timing config whose geometry can be validated in isolation. Composed by
 * picking the canonical fields from their owning config types so the field set never drifts from the config
 * layer: slot durations from {@link L1ContractsConfig}, block sub-slot/checkpoint timings from
 * {@link SequencerConfig} (whose fields are optional there, hence `Required`).
 */
export type NetworkConsensusConfig = Pick<L1ContractsConfig, 'aztecSlotDuration' | 'ethereumSlotDuration'> &
  Required<Pick<SequencerConfig, 'blockDurationMs' | 'maxBlocksPerCheckpoint' | 'checkpointProposalSyncGraceSeconds'>>;

/** Config mappings for the slot-timing fields of {@link NetworkConsensusConfig}, picked from their owners. */
const networkConsensusConfigMappings = {
  ...pickConfigMappings(l1ContractsConfigMappings, ['aztecSlotDuration', 'ethereumSlotDuration']),
  ...pickConfigMappings(sharedSequencerConfigMappings, [
    'blockDurationMs',
    'maxBlocksPerCheckpoint',
    'checkpointProposalSyncGraceSeconds',
  ]),
};

/**
 * Extracts the timing {@link NetworkConsensusConfig} from a generated network config object. The env-var names
 * and the per-field parsing both come from the canonical config mappings (`l1ContractsConfigMappings` and
 * `sharedSequencerConfigMappings`), so each field is parsed exactly as the node's config layer would parse it.
 * A field whose env var is absent becomes `NaN`, which {@link validateNetworkConsensusConfig} reports as an
 * error. Never throws: parse helpers that would throw or yield `undefined` are coerced to `NaN`.
 */
export function getConsensusConfigFromNetworkEnv(
  values: Record<string, string | number | boolean>,
): NetworkConsensusConfig {
  const result = {} as Record<keyof NetworkConsensusConfig, number>;
  for (const [field, mapping] of Object.entries(networkConsensusConfigMappings)) {
    const raw = mapping.env !== undefined ? values[mapping.env] : undefined;
    if (raw === undefined) {
      result[field as keyof NetworkConsensusConfig] = NaN;
      continue;
    }
    let parsed: number | undefined;
    try {
      parsed = mapping.parseEnv ? mapping.parseEnv(String(raw)) : Number(raw);
    } catch {
      parsed = NaN;
    }
    result[field as keyof NetworkConsensusConfig] = parsed ?? NaN;
  }
  return result;
}

/**
 * Validates a {@link NetworkConsensusConfig} for self-consistency, returning a list of error messages (empty
 * when valid). Used by the cli unit test that gates the generated network configs.
 *
 * The check requires `maxBlocksPerCheckpoint` to be *exactly* what a {@link ProposerTimetable} built from the
 * same slot timings and the production default budgets derives. This exact-equality requirement ensures the
 * published network value is precisely what the production default budgets produce, so every node running those
 * defaults agrees on the per-checkpoint block count without clamping. It must also be at least
 * {@link MIN_BLOCKS_FOR_INBOX_CATCHUP}, without which the network is permanently haltable.
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

  errors.push(...validateSlotDurations(config));
  if (config.blockDurationMs <= 0) {
    errors.push(`blockDurationMs must be positive (got ${config.blockDurationMs})`);
  }
  if (config.blockDurationMs / 1000 > config.aztecSlotDuration) {
    errors.push(
      `blockDurationMs (${config.blockDurationMs}ms) exceeds aztecSlotDuration (${config.aztecSlotDuration}s)`,
    );
  }
  if (config.maxBlocksPerCheckpoint < MIN_BLOCKS_FOR_INBOX_CATCHUP) {
    errors.push(
      `maxBlocksPerCheckpoint must be at least ${MIN_BLOCKS_FOR_INBOX_CATCHUP} so a checkpoint can always clear a ` +
        `mandatory streaming-Inbox backlog (got ${config.maxBlocksPerCheckpoint}); lower the block duration or raise ` +
        `the slot duration so the proposer budgets derive at least that many blocks`,
    );
  }
  if (config.maxBlocksPerCheckpoint > MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT) {
    errors.push(
      `maxBlocksPerCheckpoint (${config.maxBlocksPerCheckpoint}) exceeds the ` +
        `${MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT} blocks nodes will build or attest to, so the network would ` +
        `reject block indices its own configuration admits`,
    );
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
 * and keeps the operator value).
 *
 * This function is pure: it never writes to `env`. Instead it returns the canonical env writes the caller
 * should apply — a map of env-var name to canonical string value for every numeric var whose env value matched
 * the network value numerically. Applying these closes a bypass where the config layer parses some vars with
 * `parseInt` (which reads '6e3' as 6); rewriting them to the network value's string form keeps the operator's
 * numerically-equal value but in canonical form. Vars kept under `ALLOW_OVERRIDING_NETWORK_CONFIG` (genuine
 * conflicts) are not included, so the operator value is preserved untouched.
 *
 * @returns Canonical env writes (env-var name -> canonical string value) for the caller to apply.
 */
export function checkConsensusEnvOverrides(
  networkConfig: Record<string, string | number | boolean>,
  env: { [key: string]: string | undefined } = process.env,
  log?: (msg: string) => void,
): Record<string, string> {
  const allowOverride = allowsNetworkConfigOverride(env);
  const canonical: Record<string, string> = {};
  const conflicts: string[] = [];

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
      if (networkIsNumeric) {
        canonical[envVar] = String(networkValue);
      }
      continue;
    }

    const conflict = `${envVar}=${current} conflicts with the network value ${networkValue}`;
    if (allowOverride) {
      log?.(
        `Environment variable ${conflict}. Consensus-critical values must match across the network, but ` +
          `ALLOW_OVERRIDING_NETWORK_CONFIG is set so the operator value is kept (only do this if you know what ` +
          `you are doing).`,
      );
      continue;
    }
    conflicts.push(conflict);
  }

  // Accumulate every conflict so the operator sees all the env vars they need to reconcile at once, rather than
  // fixing them one failed startup at a time.
  if (conflicts.length > 0) {
    throw new Error(
      `Environment variables conflict with consensus-critical network values:\n` +
        conflicts.map(c => `  - ${c}`).join('\n') +
        `\nConsensus-critical values must match across the network. Set ALLOW_OVERRIDING_NETWORK_CONFIG=1 to ` +
        `override (only do this if you know what you are doing).`,
    );
  }

  return canonical;
}

/** Whether the env opts into overriding network-wide consensus values (`ALLOW_OVERRIDING_NETWORK_CONFIG`). */
export function allowsNetworkConfigOverride(env: { [key: string]: string | undefined } = process.env): boolean {
  const value = env.ALLOW_OVERRIDING_NETWORK_CONFIG;
  return value === '1' || value?.toLowerCase() === 'true';
}
