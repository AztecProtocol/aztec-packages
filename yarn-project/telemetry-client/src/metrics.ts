/**
 * @file Metric names used in Aztec.
 * Metric names must be unique and not clash with {@link attributes.ts | Attribute names}.
 * Prefix metric names with `aztec` and use dots `.` to separate namespaces.
 *
 * @see {@link https://opentelemetry.io/docs/specs/semconv/general/metrics/ | OpenTelemetry Metrics} for naming conventions.
 */
import { ValueType } from '@opentelemetry/api';

/**
 * Defines the complete metadata for a metric.
 * Co-locates name, description, unit, and value type in a single definition.
 */
export interface MetricDefinition {
  /** The metric name (e.g., 'aztec.sequencer.block.build_duration') */
  readonly name: string;

  /** Human-readable description of what this metric measures */
  readonly description: string;

  /**
   * The unit of measurement.
   * Common units: 'ms', 's', 'By', 'gas', 'mana', 'mana/s', 'gwei', 'eth', 'peers', 'requests', 'tx', 'blobs', 'blocks'
   * @see https://opentelemetry.io/docs/specs/semconv/general/metrics/ for conventions
   */
  readonly unit?: string;

  /**
   * The type of value reported.
   * INT for counts/integers, DOUBLE for fractional values.
   * @default ValueType.DOUBLE (OpenTelemetry default)
   */
  readonly valueType?: ValueType;
}

export const BLOB_SINK_STORE_REQUESTS: MetricDefinition = {
  name: 'aztec.blob_sink.store_request_count',
  description: 'Number of blob store requests',
  valueType: ValueType.INT,
};
export const BLOB_SINK_RETRIEVE_REQUESTS: MetricDefinition = {
  name: 'aztec.blob_sink.retrieve_request_count',
  description: 'Number of blob retrieve requests',
  valueType: ValueType.INT,
};
export const BLOB_SINK_OBJECTS_IN_BLOB_STORE: MetricDefinition = {
  name: 'aztec.blob_sink.objects_in_blob_store',
  description: 'Number of objects in the blob store',
  valueType: ValueType.INT,
};
export const BLOB_SINK_BLOB_SIZE: MetricDefinition = {
  name: 'aztec.blob_sink.blob_size',
  description: 'Size of blobs',
  unit: 'By',
  valueType: ValueType.INT,
};

export const BLOB_SINK_ARCHIVE_BLOB_REQUEST_COUNT: MetricDefinition = {
  name: 'aztec.blob_sink.archive.block_request_count',
  description: 'Number of archive blob requests',
  valueType: ValueType.INT,
};
export const BLOB_SINK_ARCHIVE_BLOCK_REQUEST_COUNT: MetricDefinition = {
  name: 'aztec.blob_sink.archive.blob_request_count',
  description: 'Number of archive block requests',
  valueType: ValueType.INT,
};
export const BLOB_SINK_ARCHIVE_BLOB_COUNT: MetricDefinition = {
  name: 'aztec.blob_sink.archive.blob_count',
  description: 'Number of blobs in archive',
  valueType: ValueType.INT,
};

export const CIRCUIT_SIMULATION_DURATION: MetricDefinition = {
  name: 'aztec.circuit.simulation.duration',
  description: 'Records how long it takes to simulate a circuit',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const CIRCUIT_SIMULATION_INPUT_SIZE: MetricDefinition = {
  name: 'aztec.circuit.simulation.input_size',
  description: 'Size of the input to the circuit simulation',
  unit: 'By',
  valueType: ValueType.INT,
};
export const CIRCUIT_SIMULATION_OUTPUT_SIZE: MetricDefinition = {
  name: 'aztec.circuit.simulation.output_size',
  description: 'Size of the output of the circuit simulation',
  unit: 'By',
  valueType: ValueType.INT,
};

export const CIRCUIT_WITNESS_GEN_DURATION: MetricDefinition = {
  name: 'aztec.circuit.witness_generation.duration',
  description: 'Records how long it takes to generate the partial witness for a circuit',
  unit: 's',
  valueType: ValueType.DOUBLE,
};
export const CIRCUIT_WITNESS_GEN_INPUT_SIZE: MetricDefinition = {
  name: 'aztec.circuit.witness_generation.input_size',
  description: 'Records the size of the input to the witness generation',
  unit: 'By',
  valueType: ValueType.INT,
};
export const CIRCUIT_WITNESS_GEN_OUTPUT_SIZE: MetricDefinition = {
  name: 'aztec.circuit.witness_generation.output_size',
  description: 'Records the size of the output of the witness generation',
  unit: 'By',
  valueType: ValueType.INT,
};

export const CIRCUIT_PROVING_DURATION: MetricDefinition = {
  name: 'aztec.circuit.proving.duration',
  description: 'Records how long it takes to prove a circuit',
  unit: 's',
  valueType: ValueType.DOUBLE,
};
export const CIRCUIT_PROVING_INPUT_SIZE: MetricDefinition = {
  name: 'aztec.circuit.proving.input_size',
  description: 'Size of the input to the circuit proving',
  unit: 'By',
  valueType: ValueType.INT,
};
export const CIRCUIT_PROVING_PROOF_SIZE: MetricDefinition = {
  name: 'aztec.circuit.proving.proof_size',
  description: 'Records the size of the proof generated for a circuit',
  unit: 'By',
  valueType: ValueType.INT,
};

export const CIRCUIT_PUBLIC_INPUTS_COUNT: MetricDefinition = {
  name: 'aztec.circuit.public_inputs_count',
  description: 'Records the number of public inputs in a circuit',
  valueType: ValueType.INT,
};
export const CIRCUIT_GATE_COUNT: MetricDefinition = {
  name: 'aztec.circuit.gate_count',
  description: 'Records the gate count of a circuit',
  valueType: ValueType.INT,
};
export const CIRCUIT_SIZE: MetricDefinition = {
  name: 'aztec.circuit.size',
  description: 'Records the size of the circuit in gates',
  valueType: ValueType.INT,
};

export const MEMPOOL_TX_COUNT: MetricDefinition = {
  name: 'aztec.mempool.tx_count',
  description: 'The current number of transactions in the mempool',
  valueType: ValueType.INT,
};
export const MEMPOOL_TX_SIZE: MetricDefinition = {
  name: 'aztec.mempool.tx_size',
  description: 'The size of transactions in the mempool',
  unit: 'By',
  valueType: ValueType.INT,
};
export const MEMPOOL_TX_ADDED_COUNT: MetricDefinition = {
  name: 'aztec.mempool.tx_added_count',
  description: 'The number of transactions added to the mempool',
  valueType: ValueType.INT,
};
export const MEMPOOL_TX_MINED_DELAY: MetricDefinition = {
  name: 'aztec.mempool.tx_mined_delay',
  description: 'Delay between transaction added and evicted from the mempool',
  unit: 'ms',
  valueType: ValueType.INT,
};

export const MEMPOOL_TX_POOL_V2_EVICTED_COUNT: MetricDefinition = {
  name: 'aztec.mempool.tx_pool_v2.evicted_count',
  description: 'The number of transactions evicted from the tx pool',
  valueType: ValueType.INT,
};
export const MEMPOOL_TX_POOL_V2_IGNORED_COUNT: MetricDefinition = {
  name: 'aztec.mempool.tx_pool_v2.ignored_count',
  description: 'The number of transactions ignored in addPendingTxs',
  valueType: ValueType.INT,
};
export const MEMPOOL_TX_POOL_V2_REJECTED_COUNT: MetricDefinition = {
  name: 'aztec.mempool.tx_pool_v2.rejected_count',
  description: 'The number of transactions rejected in addPendingTxs',
  valueType: ValueType.INT,
};
export const MEMPOOL_TX_POOL_V2_SOFT_DELETED_HITS: MetricDefinition = {
  name: 'aztec.mempool.tx_pool_v2.soft_deleted_hits',
  description: 'The number of transactions found in the soft-deleted pool',
  valueType: ValueType.INT,
};
export const MEMPOOL_TX_POOL_V2_MISSING_ON_PROTECT: MetricDefinition = {
  name: 'aztec.mempool.tx_pool_v2.missing_on_protect',
  description: 'The number of truly missing transactions in protectTxs',
  valueType: ValueType.INT,
};
export const MEMPOOL_TX_POOL_V2_MISSING_PREVIOUSLY_EVICTED: MetricDefinition = {
  name: 'aztec.mempool.tx_pool_v2.missing_previously_evicted',
  description: 'The number of truly missing transactions in protectTxs that were previously evicted',
  valueType: ValueType.INT,
};
export const MEMPOOL_TX_POOL_V2_METADATA_MEMORY: MetricDefinition = {
  name: 'aztec.mempool.tx_pool_v2.metadata_memory',
  description: 'Estimated total memory consumed by in-memory transaction metadata',
  unit: 'By',
  valueType: ValueType.INT,
};

export const MEMPOOL_TX_POOL_V2_DUPLICATE_ADD: MetricDefinition = {
  name: 'aztec.mempool.tx_pool_v2.duplicate_add',
  description: 'Transactions received via addPendingTxs that were already in the pool',
  valueType: ValueType.INT,
};

export const MEMPOOL_TX_POOL_V2_ALREADY_PROTECTED_ADD: MetricDefinition = {
  name: 'aztec.mempool.tx_pool_v2.already_protected_add',
  description: 'Transactions received via addPendingTxs that were already pre-protected',
  valueType: ValueType.INT,
};

export const DB_NUM_ITEMS: MetricDefinition = {
  name: 'aztec.db.num_items',
  description: 'LMDB Num Items',
  valueType: ValueType.INT,
};
export const DB_MAP_SIZE: MetricDefinition = {
  name: 'aztec.db.map_size',
  description: 'LMDB Map Size',
  unit: 'By',
  valueType: ValueType.INT,
};
export const DB_PHYSICAL_FILE_SIZE: MetricDefinition = {
  name: 'aztec.db.physical_file_size',
  description: 'LMDB Physical File Size',
  unit: 'By',
  valueType: ValueType.INT,
};
export const DB_USED_SIZE: MetricDefinition = {
  name: 'aztec.db.used_size',
  description: 'LMDB Used Size',
  unit: 'By',
  valueType: ValueType.INT,
};

export const MEMPOOL_ATTESTATIONS_COUNT: MetricDefinition = {
  name: 'aztec.mempool.attestations_count',
  description: 'The current number of attestations in the mempool',
  valueType: ValueType.INT,
};
export const MEMPOOL_ATTESTATIONS_SIZE: MetricDefinition = {
  name: 'aztec.mempool.attestations_size',
  description: 'The size of attestations in the mempool',
  unit: 'By',
  valueType: ValueType.INT,
};
export const MEMPOOL_ATTESTATIONS_ADDED_COUNT: MetricDefinition = {
  name: 'aztec.mempool.attestations_added_count',
  description: 'The number of attestations added to the mempool',
  valueType: ValueType.INT,
};
export const MEMPOOL_ATTESTATIONS_MINED_DELAY: MetricDefinition = {
  name: 'aztec.mempool.attestations_mined_delay',
  description: 'Delay between attestation added and evicted from the mempool',
  unit: 'ms',
  valueType: ValueType.INT,
};

export const ARCHIVER_L1_BLOCK_HEIGHT: MetricDefinition = {
  name: 'aztec.archiver.l1_block_height',
  description: 'The height of the latest L1 block processed by the archiver',
  valueType: ValueType.INT,
};
export const ARCHIVER_BLOCK_HEIGHT: MetricDefinition = {
  name: 'aztec.archiver.block_height',
  description: 'The height of the latest block processed by the archiver',
  valueType: ValueType.INT,
};
export const ARCHIVER_CHECKPOINT_HEIGHT: MetricDefinition = {
  name: 'aztec.archiver.checkpoint_height',
  description: 'The height of the latest checkpoint processed by the archiver',
  valueType: ValueType.INT,
};
export const ARCHIVER_ROLLUP_PROOF_DELAY: MetricDefinition = {
  name: 'aztec.archiver.rollup_proof_delay',
  description: 'Time after a block is submitted until its proof is published',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const ARCHIVER_ROLLUP_PROOF_COUNT: MetricDefinition = {
  name: 'aztec.archiver.rollup_proof_count',
  description: 'Number of proofs submitted',
  valueType: ValueType.INT,
};

export const ARCHIVER_MANA_PER_BLOCK: MetricDefinition = {
  name: 'aztec.archiver.block.mana_count',
  description: 'The mana consumed by blocks',
  unit: 'Mmana',
  valueType: ValueType.DOUBLE,
};
export const ARCHIVER_TXS_PER_BLOCK: MetricDefinition = {
  name: 'aztec.archiver.block.tx_count',
  description: 'The block tx count',
  unit: 'tx',
  valueType: ValueType.INT,
};
export const ARCHIVER_SYNC_PER_BLOCK: MetricDefinition = {
  name: 'aztec.archiver.block.sync_per_item_duration',
  description: 'Duration to sync a block',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const ARCHIVER_SYNC_BLOCK_COUNT: MetricDefinition = {
  name: 'aztec.archiver.block.sync_count',
  description: 'Number of blocks synced from L1',
  valueType: ValueType.INT,
};

export const ARCHIVER_SYNC_PER_MESSAGE: MetricDefinition = {
  name: 'aztec.archiver.message.sync_per_item_duration',
  description: 'Duration to sync a message',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const ARCHIVER_SYNC_MESSAGE_COUNT: MetricDefinition = {
  name: 'aztec.archiver.message.sync_count',
  description: 'Number of L1 to L2 messages synced',
  valueType: ValueType.INT,
};

export const ARCHIVER_PRUNE_DURATION: MetricDefinition = {
  name: 'aztec.archiver.prune_duration',
  description: 'Duration of a prune operation',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const ARCHIVER_PRUNE_COUNT: MetricDefinition = {
  name: 'aztec.archiver.prune_count',
  description: 'Number of prunes detected',
  valueType: ValueType.INT,
};

export const ARCHIVER_TOTAL_TXS: MetricDefinition = {
  name: 'aztec.archiver.tx_count',
  description: 'The total number of transactions',
  valueType: ValueType.INT,
};

export const ARCHIVER_BLOCK_PROPOSAL_TX_TARGET_COUNT: MetricDefinition = {
  name: 'aztec.archiver.block_proposal_tx_target_count',
  description: 'Number of block proposals by tx target',
  valueType: ValueType.INT,
};

export const NODE_RECEIVE_TX_DURATION: MetricDefinition = {
  name: 'aztec.node.receive_tx.duration',
  description: 'The duration of the receiveTx method',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const NODE_RECEIVE_TX_COUNT: MetricDefinition = {
  name: 'aztec.node.receive_tx.count',
  description: 'Number of transactions received',
  valueType: ValueType.INT,
};

export const NODE_SNAPSHOT_DURATION: MetricDefinition = {
  name: 'aztec.node.snapshot_duration',
  description: 'How long taking a snapshot takes',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const NODE_SNAPSHOT_ERROR_COUNT: MetricDefinition = {
  name: 'aztec.node.snapshot_error_count',
  description: 'How many snapshot errors have happened',
  valueType: ValueType.INT,
};

export const SEQUENCER_STATE_TRANSITION_BUFFER_DURATION: MetricDefinition = {
  name: 'aztec.sequencer.state_transition_buffer.duration',
  description:
    'The time difference between when the sequencer needed to transition to a new state and when it actually did',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const SEQUENCER_BLOCK_BUILD_DURATION: MetricDefinition = {
  name: 'aztec.sequencer.block.build_duration',
  description: 'Duration to build a block',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const SEQUENCER_BLOCK_BUILD_MANA_PER_SECOND: MetricDefinition = {
  name: 'aztec.sequencer.block.build_mana_per_second',
  description: 'Mana per second when building a block',
  unit: 'mana/s',
  valueType: ValueType.INT,
};
export const SEQUENCER_BLOCK_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.block.count',
  description: 'Number of blocks built by this sequencer',
  valueType: ValueType.INT,
};
export const SEQUENCER_CURRENT_SLOT_REWARDS: MetricDefinition = {
  name: 'aztec.sequencer.current_slot_rewards',
  description: 'The rewards earned per filled slot',
  valueType: ValueType.DOUBLE,
};
export const SEQUENCER_SLOT_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.slot.total_count',
  description: 'The number of slots this sequencer was selected for',
  valueType: ValueType.INT,
};
export const SEQUENCER_FILLED_SLOT_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.slot.filled_count',
  description: 'The number of slots this sequencer has filled',
  valueType: ValueType.INT,
};

export const SEQUENCER_CHECKPOINT_ATTESTATION_DELAY: MetricDefinition = {
  name: 'aztec.sequencer.checkpoint.attestation_delay',
  description: 'The time difference between checkpoint proposal and minimal attestation count reached',
  unit: 'ms',
  valueType: ValueType.INT,
};

export const SEQUENCER_COLLECTED_ATTESTATIONS_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.attestations.collected_count',
  description: 'The number of attestations collected for a checkpoint proposal',
  valueType: ValueType.INT,
};
export const SEQUENCER_REQUIRED_ATTESTATIONS_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.attestations.required_count',
  description: 'The minimum number of attestations required to publish a checkpoint',
  valueType: ValueType.INT,
};
export const SEQUENCER_COLLECT_ATTESTATIONS_DURATION: MetricDefinition = {
  name: 'aztec.sequencer.attestations.collect_duration',
  description: 'The time spent collecting attestations from committee members',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const SEQUENCER_COLLECT_ATTESTATIONS_TIME_ALLOWANCE: MetricDefinition = {
  name: 'aztec.sequencer.attestations.collect_allowance',
  description: 'Maximum amount of time to collect attestations',
  unit: 'ms',
  valueType: ValueType.INT,
};

export const SEQUENCER_BLOCK_PROPOSAL_FAILED_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.block.proposal_failed_count',
  description: 'The number of times block proposal failed (including validation builds)',
  valueType: ValueType.INT,
};
export const SEQUENCER_CHECKPOINT_PROPOSAL_SUCCESS_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.checkpoint.proposal_success_count',
  description: 'The number of times checkpoint proposal succeeded',
  valueType: ValueType.INT,
};
export const SEQUENCER_CHECKPOINT_PRECHECK_FAILED_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.checkpoint.precheck_failed_count',
  description: 'The number of times checkpoint pre-build checks failed',
  valueType: ValueType.INT,
};
export const SEQUENCER_CHECKPOINT_PROPOSAL_FAILED_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.checkpoint.proposal_failed_count',
  description: 'The number of times checkpoint proposal failed',
  valueType: ValueType.INT,
};
export const SEQUENCER_CHECKPOINT_BUILD_DURATION: MetricDefinition = {
  name: 'aztec.sequencer.checkpoint.build_duration',
  description: 'Total duration to build all blocks in a checkpoint',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const SEQUENCER_CHECKPOINT_BLOCK_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.checkpoint.block_count',
  description: 'Number of blocks built in a checkpoint',
  valueType: ValueType.INT,
};
export const SEQUENCER_CHECKPOINT_TX_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.checkpoint.tx_count',
  description: 'Total number of transactions across all blocks in a checkpoint',
  unit: 'tx',
  valueType: ValueType.INT,
};
export const SEQUENCER_CHECKPOINT_TOTAL_MANA: MetricDefinition = {
  name: 'aztec.sequencer.checkpoint.total_mana',
  description: 'Total L2 mana used across all blocks in a checkpoint',
  unit: 'mana',
  valueType: ValueType.INT,
};
export const SEQUENCER_SLASHING_ATTEMPTS_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.slashing.attempts_count',
  description: 'The number of slashing action attempts',
  valueType: ValueType.INT,
};
export const SEQUENCER_CHECKPOINT_SUCCESS_COUNT: MetricDefinition = {
  name: 'aztec.sequencer.checkpoint.success_count',
  description: 'The number of times checkpoint publishing succeeded',
  valueType: ValueType.INT,
};

// Fisherman fee analysis metrics
export const FISHERMAN_FEE_ANALYSIS_WOULD_BE_INCLUDED: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.would_be_included',
  description: 'Whether the transaction would have been included in the block',
  valueType: ValueType.INT,
};
export const FISHERMAN_FEE_ANALYSIS_TIME_BEFORE_BLOCK: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.time_before_block',
  description: 'Time in ms between fee analysis and block being mined',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const FISHERMAN_FEE_ANALYSIS_PENDING_BLOB_TX_COUNT: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.pending_blob_tx_count',
  description: 'Number of blob transactions seen in the pending block',
  valueType: ValueType.INT,
};
export const FISHERMAN_FEE_ANALYSIS_INCLUDED_BLOB_TX_COUNT: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.included_blob_tx_count',
  description: 'Number of blob transactions that got included in the mined block',
  valueType: ValueType.INT,
};
export const FISHERMAN_FEE_ANALYSIS_CALCULATED_PRIORITY_FEE: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.calculated_priority_fee',
  description: 'Priority fee calculated by each strategy',
  unit: 'gwei',
  valueType: ValueType.DOUBLE,
};
export const FISHERMAN_FEE_ANALYSIS_PRIORITY_FEE_DELTA: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.priority_fee_delta',
  description: 'Difference between our priority fee and minimum included priority fee',
  unit: 'gwei',
  valueType: ValueType.DOUBLE,
};
export const FISHERMAN_FEE_ANALYSIS_ESTIMATED_COST: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.estimated_cost',
  description: 'Estimated total cost in ETH for the transaction with this strategy',
  unit: 'eth',
  valueType: ValueType.DOUBLE,
};
export const FISHERMAN_FEE_ANALYSIS_ESTIMATED_OVERPAYMENT: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.estimated_overpayment',
  description: 'Estimated overpayment in ETH vs minimum required for inclusion',
  unit: 'eth',
  valueType: ValueType.DOUBLE,
};
export const FISHERMAN_FEE_ANALYSIS_MINED_BLOB_TX_PRIORITY_FEE: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.mined_blob_tx_priority_fee',
  description: 'Priority fee per gas for blob transactions in mined blocks',
  unit: 'gwei',
  valueType: ValueType.DOUBLE,
};
export const FISHERMAN_FEE_ANALYSIS_MINED_BLOB_TX_TOTAL_COST: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.mined_blob_tx_total_cost',
  description: 'Total cost in ETH for blob transactions in mined blocks',
  unit: 'eth',
  valueType: ValueType.DOUBLE,
};
export const FISHERMAN_FEE_ANALYSIS_PENDING_BLOB_COUNT: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.pending_blob_count',
  description: 'Total number of blobs in pending blob transactions',
  unit: 'blobs',
  valueType: ValueType.INT,
};
export const FISHERMAN_FEE_ANALYSIS_INCLUDED_BLOB_COUNT: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.included_blob_count',
  description: 'Total number of blobs included in the mined block',
  unit: 'blobs',
  valueType: ValueType.INT,
};
export const FISHERMAN_FEE_ANALYSIS_BLOCK_BLOBS_FULL: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.block_blobs_full',
  description: 'Whether the mined block reached 100% blob capacity',
  valueType: ValueType.INT,
};
export const FISHERMAN_FEE_ANALYSIS_MAX_BLOB_CAPACITY: MetricDefinition = {
  name: 'aztec.fisherman.fee_analysis.max_blob_capacity',
  description: 'Maximum blob capacity for the analyzed block based on L1 upgrade schedule',
  unit: 'blobs',
  valueType: ValueType.INT,
};

export const VALIDATOR_INVALID_ATTESTATION_RECEIVED_COUNT: MetricDefinition = {
  name: 'aztec.validator.invalid_attestation_received_count',
  description: 'Number of invalid attestations received',
  valueType: ValueType.INT,
};

export const L1_PUBLISHER_GAS_PRICE: MetricDefinition = {
  name: 'aztec.l1_publisher.gas_price',
  description: 'The gas price used for transactions',
  unit: 'gwei',
  valueType: ValueType.DOUBLE,
};
export const L1_PUBLISHER_TX_COUNT: MetricDefinition = {
  name: 'aztec.l1_publisher.tx_count',
  description: 'The number of transactions processed',
};
export const L1_PUBLISHER_TX_DURATION: MetricDefinition = {
  name: 'aztec.l1_publisher.tx_duration',
  description: 'The duration of transaction processing',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const L1_PUBLISHER_TX_GAS: MetricDefinition = {
  name: 'aztec.l1_publisher.tx_gas',
  description: 'The gas consumed by transactions',
  unit: 'gas',
  valueType: ValueType.INT,
};
export const L1_PUBLISHER_TX_CALLDATA_SIZE: MetricDefinition = {
  name: 'aztec.l1_publisher.tx_calldata_size',
  description: 'The size of the calldata in transactions',
  unit: 'By',
  valueType: ValueType.INT,
};
export const L1_PUBLISHER_TX_CALLDATA_GAS: MetricDefinition = {
  name: 'aztec.l1_publisher.tx_calldata_gas',
  description: 'The gas consumed by the calldata in transactions',
  unit: 'gas',
  valueType: ValueType.INT,
};
export const L1_PUBLISHER_TX_BLOBDATA_GAS_USED: MetricDefinition = {
  name: 'aztec.l1_publisher.tx_blobdata_gas_used',
  description: 'The amount of blob gas used in transactions',
  unit: 'gas',
  valueType: ValueType.INT,
};
export const L1_PUBLISHER_TX_BLOBDATA_GAS_COST: MetricDefinition = {
  name: 'aztec.l1_publisher.tx_blobdata_gas_cost',
  description: 'The gas cost of blobs in transactions',
  unit: 'gwei',
  valueType: ValueType.INT,
};
export const L1_PUBLISHER_BLOB_COUNT: MetricDefinition = {
  name: 'aztec.l1_publisher.blob_count',
  description: 'Number of blobs in L1 transactions',
  unit: 'blobs',
  valueType: ValueType.INT,
};
export const L1_PUBLISHER_BLOB_INCLUSION_BLOCKS: MetricDefinition = {
  name: 'aztec.l1_publisher.blob_inclusion_blocks',
  description: 'Number of L1 blocks between blob tx submission and inclusion',
  unit: 'blocks',
  valueType: ValueType.INT,
};
export const L1_PUBLISHER_BLOB_TX_SUCCESS: MetricDefinition = {
  name: 'aztec.l1_publisher.blob_tx_success',
  description: 'Number of successful L1 transactions with blobs',
};
export const L1_PUBLISHER_BLOB_TX_FAILURE: MetricDefinition = {
  name: 'aztec.l1_publisher.blob_tx_failure',
  description: 'Number of failed L1 transactions with blobs',
};
export const L1_PUBLISHER_BALANCE: MetricDefinition = {
  name: 'aztec.l1_publisher.balance',
  description: 'The balance of the sender address',
  unit: 'eth',
  valueType: ValueType.DOUBLE,
};
export const L1_PUBLISHER_TX_TOTAL_FEE: MetricDefinition = {
  name: 'aztec.l1_publisher.tx_total_fee',
  description: 'How much L1 tx costs',
  unit: 'eth',
  valueType: ValueType.DOUBLE,
};

export const L1_BLOCK_HEIGHT: MetricDefinition = {
  name: 'aztec.l1.block_height',
  description: 'The current L1 block height',
  valueType: ValueType.INT,
};
export const L1_BALANCE_ETH: MetricDefinition = {
  name: 'aztec.l1.balance',
  description: 'ETH balance of an address',
  unit: 'eth',
  valueType: ValueType.DOUBLE,
};
export const L1_GAS_PRICE_WEI: MetricDefinition = {
  name: 'aztec.l1.gas_price',
  description: 'Current L1 gas price',
  unit: 'wei',
  valueType: ValueType.INT,
};
export const L1_BLOB_BASE_FEE_WEI: MetricDefinition = {
  name: 'aztec.l1.blob_base_fee',
  description: 'Current L1 blob base fee',
  unit: 'wei',
  valueType: ValueType.INT,
};

export const L1_TX_MINED_DURATION: MetricDefinition = {
  name: 'aztec.l1_tx.mined_duration',
  description: 'Duration from L1 tx submission to mining',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const L1_TX_MINED_COUNT: MetricDefinition = {
  name: 'aztec.l1_tx.mined_count',
  description: 'Number of L1 transactions mined',
  valueType: ValueType.INT,
};
export const L1_TX_REVERTED_COUNT: MetricDefinition = {
  name: 'aztec.l1_tx.reverted_count',
  description: 'Number of L1 transactions reverted',
  valueType: ValueType.INT,
};
export const L1_TX_CANCELLED_COUNT: MetricDefinition = {
  name: 'aztec.l1_tx.cancelled_count',
  description: 'Number of L1 transactions cancelled',
  valueType: ValueType.INT,
};
export const L1_TX_NOT_MINED_COUNT: MetricDefinition = {
  name: 'aztec.l1_tx.not_mined_count',
  description: 'Number of L1 transactions not mined',
  valueType: ValueType.INT,
};
export const L1_TX_ATTEMPTS_UNTIL_MINED: MetricDefinition = {
  name: 'aztec.l1_tx.attempts_until_mined',
  description: 'Number of attempts until L1 tx was mined',
  valueType: ValueType.INT,
};
export const L1_TX_MAX_PRIORITY_FEE: MetricDefinition = {
  name: 'aztec.l1_tx.max_priority_fee',
  description: 'Max priority fee used for L1 tx',
  unit: 'gwei',
  valueType: ValueType.DOUBLE,
};
export const L1_TX_MAX_FEE: MetricDefinition = {
  name: 'aztec.l1_tx.max_fee',
  description: 'Max fee used for L1 tx',
  unit: 'gwei',
  valueType: ValueType.DOUBLE,
};
export const L1_TX_BLOB_FEE: MetricDefinition = {
  name: 'aztec.l1_tx.blob_fee',
  description: 'Blob fee used for L1 tx',
  unit: 'gwei',
  valueType: ValueType.DOUBLE,
};

export const PEER_MANAGER_GOODBYES_SENT: MetricDefinition = {
  name: 'aztec.peer_manager.goodbyes_sent',
  description: 'Number of goodbyes sent to peers',
  unit: 'peers',
  valueType: ValueType.INT,
};
export const PEER_MANAGER_GOODBYES_RECEIVED: MetricDefinition = {
  name: 'aztec.peer_manager.goodbyes_received',
  description: 'Number of goodbyes received from peers',
  unit: 'peers',
  valueType: ValueType.INT,
};
export const PEER_MANAGER_PEER_COUNT: MetricDefinition = {
  name: 'aztec.peer_manager.peer_count',
  description: 'Number of peers',
  unit: 'peers',
  valueType: ValueType.INT,
};
export const PEER_MANAGER_LOW_SCORE_DISCONNECTS: MetricDefinition = {
  name: 'aztec.peer_manager.low_score_disconnects',
  description: 'Number of peers disconnected due to low score',
  unit: 'peers',
  valueType: ValueType.INT,
};
export const PEER_MANAGER_PEER_CONNECTION_DURATION: MetricDefinition = {
  name: 'aztec.peer_manager.peer_connection_duration',
  description: 'Time duration between peer connection and disconnection',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const P2P_PEER_STATE_COUNT: MetricDefinition = {
  name: 'aztec.p2p.peer_state_count',
  description: 'Number of peers in each state',
  unit: 'peers',
  valueType: ValueType.INT,
};

export const P2P_REQ_RESP_SENT_REQUESTS: MetricDefinition = {
  name: 'aztec.p2p.req_resp.sent_requests',
  description: 'Number of requests sent to peers',
  unit: 'requests',
  valueType: ValueType.INT,
};
export const P2P_REQ_RESP_RECEIVED_REQUESTS: MetricDefinition = {
  name: 'aztec.p2p.req_resp.received_requests',
  description: 'Number of requests received from peers',
  unit: 'requests',
  valueType: ValueType.INT,
};
export const P2P_REQ_RESP_FAILED_OUTBOUND_REQUESTS: MetricDefinition = {
  name: 'aztec.p2p.req_resp.failed_outbound_requests',
  description: 'Number of failed outbound requests - nodes not getting valid responses',
  unit: 'requests',
  valueType: ValueType.INT,
};
export const P2P_REQ_RESP_FAILED_INBOUND_REQUESTS: MetricDefinition = {
  name: 'aztec.p2p.req_resp.failed_inbound_requests',
  description: 'Number of failed inbound requests - node failing to respond to requests',
  unit: 'requests',
  valueType: ValueType.INT,
};

export const P2P_GOSSIP_MESSAGE_VALIDATION_DURATION: MetricDefinition = {
  name: 'aztec.p2p.gossip.message_validation_duration',
  description: 'Duration to validate a gossip message',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const P2P_GOSSIP_MESSAGE_PREVALIDATION_COUNT: MetricDefinition = {
  name: 'aztec.p2p.gossip.message_validation_count',
  description: 'Number of gossip messages validated',
  valueType: ValueType.INT,
};
export const P2P_GOSSIP_MESSAGE_LATENCY: MetricDefinition = {
  name: 'aztec.p2p.gossip.message_latency',
  description: 'Latency of gossip messages',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const P2P_GOSSIP_TX_RECEIVED_COUNT: MetricDefinition = {
  name: 'aztec.p2p.gossip.tx_received_count',
  description: 'Number of transactions received via gossip',
  valueType: ValueType.INT,
};

export const P2P_GOSSIP_AGG_MESSAGE_LATENCY_MIN: MetricDefinition = {
  name: 'aztec.p2p.gossip.agg_message_latency_min',
  description: 'Minimum aggregated gossip message latency',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const P2P_GOSSIP_AGG_MESSAGE_LATENCY_MAX: MetricDefinition = {
  name: 'aztec.p2p.gossip.agg_message_latency_max',
  description: 'Maximum aggregated gossip message latency',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const P2P_GOSSIP_AGG_MESSAGE_LATENCY_P50: MetricDefinition = {
  name: 'aztec.p2p.gossip.agg_message_latency_p50',
  description: 'P50 aggregated gossip message latency',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const P2P_GOSSIP_AGG_MESSAGE_LATENCY_P90: MetricDefinition = {
  name: 'aztec.p2p.gossip.agg_message_latency_p90',
  description: 'P90 aggregated gossip message latency',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const P2P_GOSSIP_AGG_MESSAGE_LATENCY_AVG: MetricDefinition = {
  name: 'aztec.p2p.gossip.agg_message_latency_avg',
  description: 'Average aggregated gossip message latency',
  unit: 'ms',
  valueType: ValueType.INT,
};

export const P2P_GOSSIP_AGG_MESSAGE_VALIDATION_DURATION_MIN: MetricDefinition = {
  name: 'aztec.p2p.gossip.agg_message_validation_duration_min',
  description: 'Minimum aggregated gossip message validation duration',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const P2P_GOSSIP_AGG_MESSAGE_VALIDATION_DURATION_MAX: MetricDefinition = {
  name: 'aztec.p2p.gossip.agg_message_validation_duration_max',
  description: 'Maximum aggregated gossip message validation duration',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const P2P_GOSSIP_AGG_MESSAGE_VALIDATION_DURATION_P50: MetricDefinition = {
  name: 'aztec.p2p.gossip.agg_message_validation_duration_p50',
  description: 'P50 aggregated gossip message validation duration',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const P2P_GOSSIP_AGG_MESSAGE_VALIDATION_DURATION_P90: MetricDefinition = {
  name: 'aztec.p2p.gossip.agg_message_validation_duration_p90',
  description: 'P90 aggregated gossip message validation duration',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const P2P_GOSSIP_AGG_MESSAGE_VALIDATION_DURATION_AVG: MetricDefinition = {
  name: 'aztec.p2p.gossip.agg_message_validation_duration_avg',
  description: 'Average aggregated gossip message validation duration',
  unit: 'ms',
  valueType: ValueType.INT,
};

export const PUBLIC_PROCESSOR_TX_DURATION: MetricDefinition = {
  name: 'aztec.public_processor.tx_duration',
  description: 'Duration to process a public transaction',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const PUBLIC_PROCESSOR_TX_COUNT: MetricDefinition = {
  name: 'aztec.public_processor.tx_count',
  description: 'Number of public transactions processed',
  valueType: ValueType.INT,
};
export const PUBLIC_PROCESSOR_TX_PHASE_COUNT: MetricDefinition = {
  name: 'aztec.public_processor.tx_phase_count',
  description: 'Number of phases in public transaction processing',
  valueType: ValueType.INT,
};
export const PUBLIC_PROCESSOR_TX_GAS: MetricDefinition = {
  name: 'aztec.public_processor.tx_gas',
  description: 'Gas consumed by public transaction',
  unit: 'gas',
  valueType: ValueType.INT,
};
export const PUBLIC_PROCESSOR_PHASE_DURATION: MetricDefinition = {
  name: 'aztec.public_processor.phase_duration',
  description: 'Duration of public processing phase',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const PUBLIC_PROCESSOR_PHASE_COUNT: MetricDefinition = {
  name: 'aztec.public_processor.phase_count',
  description: 'Number of public processing phases',
  valueType: ValueType.INT,
};
export const PUBLIC_PROCESSOR_DEPLOY_BYTECODE_SIZE: MetricDefinition = {
  name: 'aztec.public_processor.deploy_bytecode_size',
  description: 'Size of deployed bytecode',
  unit: 'By',
  valueType: ValueType.INT,
};
export const PUBLIC_PROCESSOR_TOTAL_GAS: MetricDefinition = {
  name: 'aztec.public_processor.total_gas',
  description: 'Total gas consumed by public processor',
  unit: 'gas',
  valueType: ValueType.INT,
};
export const PUBLIC_PROCESSOR_TOTAL_GAS_HISTOGRAM: MetricDefinition = {
  name: 'aztec.public_processor.total_gas_histogram',
  description: 'Histogram of total gas consumed by public processor',
  unit: 'gas',
  valueType: ValueType.INT,
};
export const PUBLIC_PROCESSOR_GAS_RATE: MetricDefinition = {
  name: 'aztec.public_processor.gas_rate',
  description: 'Gas rate in public processor',
  unit: 'gas/s',
  valueType: ValueType.DOUBLE,
};
export const PUBLIC_PROCESSOR_TREE_INSERTION: MetricDefinition = {
  name: 'aztec.public_processor.tree_insertion',
  description: 'Duration of tree insertion in public processor',
  unit: 'ms',
  valueType: ValueType.INT,
};

export const PUBLIC_EXECUTOR_PREFIX = 'aztec.public_executor.';
export const PUBLIC_EXECUTOR_SIMULATION_COUNT: MetricDefinition = {
  name: 'aztec.public_executor.simulation_count',
  description: 'Number of functions executed',
  valueType: ValueType.INT,
};
export const PUBLIC_EXECUTOR_SIMULATION_DURATION: MetricDefinition = {
  name: 'aztec.public_executor.simulation_duration',
  description: 'How long it takes to execute a function',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const PUBLIC_EXECUTOR_SIMULATION_MANA_PER_SECOND: MetricDefinition = {
  name: 'aztec.public_executor.simulation_mana_per_second',
  description: 'Mana used per second',
  unit: 'mana/s',
  valueType: ValueType.INT,
};
export const PUBLIC_EXECUTOR_SIMULATION_MANA_USED: MetricDefinition = {
  name: 'aztec.public_executor.simulation_mana_used',
  description: 'Total mana used',
  unit: 'mana',
  valueType: ValueType.INT,
};
export const PUBLIC_EXECUTOR_SIMULATION_TOTAL_INSTRUCTIONS: MetricDefinition = {
  name: 'aztec.public_executor.simulation_total_instructions',
  description: 'Total number of instructions executed',
  valueType: ValueType.INT,
};
export const PUBLIC_EXECUTOR_TX_HASHING: MetricDefinition = {
  name: 'aztec.public_executor.tx_hashing',
  description: 'Tx hashing time',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const PUBLIC_EXECUTOR_PRIVATE_EFFECTS_INSERTION: MetricDefinition = {
  name: 'aztec.public_executor.private_effects_insertion',
  description: 'Private effects insertion time',
  unit: 'us',
  valueType: ValueType.INT,
};
export const PUBLIC_EXECUTOR_SIMULATION_BYTECODE_SIZE: MetricDefinition = {
  name: 'aztec.public_executor.simulation_bytecode_size',
  description: 'Size of bytecode being executed',
  unit: 'By',
  valueType: ValueType.INT,
};

export const PROVING_ORCHESTRATOR_BASE_ROLLUP_INPUTS_DURATION: MetricDefinition = {
  name: 'aztec.proving_orchestrator.base_rollup.inputs_duration',
  description: 'Duration to build base rollup inputs',
  unit: 'ms',
  valueType: ValueType.INT,
};

export const PROVING_QUEUE_JOB_SIZE: MetricDefinition = {
  name: 'aztec.proving_queue.job_size',
  description: 'Size of proving jobs',
  unit: 'By',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_SIZE: MetricDefinition = {
  name: 'aztec.proving_queue.size',
  description: 'Number of jobs in the proving queue',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_TOTAL_JOBS: MetricDefinition = {
  name: 'aztec.proving_queue.enqueued_jobs_count',
  description: 'Total number of jobs enqueued',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_CACHED_JOBS: MetricDefinition = {
  name: 'aztec.proving_queue.cached_jobs_count',
  description: 'Number of cached proving jobs',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_ACTIVE_JOBS: MetricDefinition = {
  name: 'aztec.proving_queue.active_jobs_count',
  description: 'Number of active proving jobs',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_RESOLVED_JOBS: MetricDefinition = {
  name: 'aztec.proving_queue.resolved_jobs_count',
  description: 'Number of resolved proving jobs',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_REJECTED_JOBS: MetricDefinition = {
  name: 'aztec.proving_queue.rejected_jobs_count',
  description: 'Number of rejected proving jobs',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_RETRIED_JOBS: MetricDefinition = {
  name: 'aztec.proving_queue.retried_jobs_count',
  description: 'Number of retried proving jobs',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_TIMED_OUT_JOBS: MetricDefinition = {
  name: 'aztec.proving_queue.timed_out_jobs_count',
  description: 'Number of timed out proving jobs',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_JOB_WAIT: MetricDefinition = {
  name: 'aztec.proving_queue.job_wait',
  description: 'Records how long a job sits in the queue',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_JOB_DURATION: MetricDefinition = {
  name: 'aztec.proving_queue.job_duration',
  description: 'Records how long a job takes to complete',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_DB_NUM_ITEMS: MetricDefinition = {
  name: 'aztec.proving_queue.db.num_items',
  description: 'Number of items in the proving queue database',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_DB_MAP_SIZE: MetricDefinition = {
  name: 'aztec.proving_queue.db.map_size',
  description: 'Map size of the proving queue database',
  unit: 'By',
  valueType: ValueType.INT,
};
export const PROVING_QUEUE_DB_USED_SIZE: MetricDefinition = {
  name: 'aztec.proving_queue.db.used_size',
  description: 'Used size of the proving queue database',
  unit: 'By',
  valueType: ValueType.INT,
};

export const PROVING_AGENT_IDLE: MetricDefinition = {
  name: 'aztec.proving_queue.agent.idle',
  description: 'Records how long an agent was idle',
  unit: 's',
  valueType: ValueType.DOUBLE,
};

export const PROVER_NODE_EXECUTION_DURATION: MetricDefinition = {
  name: 'aztec.prover_node.execution.duration',
  description: 'Duration of execution of an epoch by the prover',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const PROVER_NODE_JOB_DURATION: MetricDefinition = {
  name: 'aztec.prover_node.job_duration',
  description: 'Duration of proving job',
  unit: 's',
  valueType: ValueType.DOUBLE,
};
export const PROVER_NODE_JOB_CHECKPOINTS: MetricDefinition = {
  name: 'aztec.prover_node.job_checkpoints',
  description: 'Number of checkpoints in a proven epoch',
  valueType: ValueType.INT,
};
export const PROVER_NODE_JOB_BLOCKS: MetricDefinition = {
  name: 'aztec.prover_node.job_blocks',
  description: 'Number of blocks in a proven epoch',
  valueType: ValueType.INT,
};
export const PROVER_NODE_JOB_TRANSACTIONS: MetricDefinition = {
  name: 'aztec.prover_node.job_transactions',
  description: 'Number of transactions in a proven epoch',
  valueType: ValueType.INT,
};
export const PROVER_NODE_REWARDS_TOTAL: MetricDefinition = {
  name: 'aztec.prover_node.rewards_total',
  description: 'The rewards earned (total)',
  valueType: ValueType.DOUBLE,
};
export const PROVER_NODE_REWARDS_PER_EPOCH: MetricDefinition = {
  name: 'aztec.prover_node.rewards_per_epoch',
  description: 'The rewards earned',
  valueType: ValueType.DOUBLE,
};

export const WORLD_STATE_FORK_DURATION: MetricDefinition = {
  name: 'aztec.world_state.fork.duration',
  description: 'Duration to fork world state',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const WORLD_STATE_SYNC_DURATION: MetricDefinition = {
  name: 'aztec.world_state.sync.duration',
  description: 'Duration to sync world state',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const WORLD_STATE_MERKLE_TREE_SIZE: MetricDefinition = {
  name: 'aztec.world_state.merkle_tree_size',
  description: 'Size of the merkle tree',
  valueType: ValueType.INT,
};
export const WORLD_STATE_DB_SIZE: MetricDefinition = {
  name: 'aztec.world_state.db_size',
  description: 'Size of the world state database',
  unit: 'By',
  valueType: ValueType.INT,
};
export const WORLD_STATE_DB_MAP_SIZE: MetricDefinition = {
  name: 'aztec.world_state.db_map_size',
  description: 'The current configured map size for each merkle tree',
  unit: 'By',
  valueType: ValueType.INT,
};
export const WORLD_STATE_DB_PHYSICAL_SIZE: MetricDefinition = {
  name: 'aztec.world_state.db_physical_size',
  description: 'The current physical disk space used for each database',
  unit: 'By',
  valueType: ValueType.INT,
};
export const WORLD_STATE_TREE_SIZE: MetricDefinition = {
  name: 'aztec.world_state.tree_size',
  description: 'The current number of leaves in each merkle tree',
  valueType: ValueType.INT,
};
export const WORLD_STATE_UNFINALIZED_HEIGHT: MetricDefinition = {
  name: 'aztec.world_state.unfinalized_height',
  description: 'The unfinalized block height of each merkle tree',
  valueType: ValueType.INT,
};
export const WORLD_STATE_FINALIZED_HEIGHT: MetricDefinition = {
  name: 'aztec.world_state.finalized_height',
  description: 'The finalized block height of each merkle tree',
  valueType: ValueType.INT,
};
export const WORLD_STATE_OLDEST_BLOCK: MetricDefinition = {
  name: 'aztec.world_state.oldest_block',
  description: 'The oldest historical block of each merkle tree',
  valueType: ValueType.INT,
};
export const WORLD_STATE_DB_USED_SIZE: MetricDefinition = {
  name: 'aztec.world_state.db_used_size',
  description: 'The current used database size for each db of each merkle tree',
  unit: 'By',
  valueType: ValueType.INT,
};
export const WORLD_STATE_DB_NUM_ITEMS: MetricDefinition = {
  name: 'aztec.world_state.db_num_items',
  description: 'The current number of items in each database of each merkle tree',
  valueType: ValueType.INT,
};
export const WORLD_STATE_REQUEST_TIME: MetricDefinition = {
  name: 'aztec.world_state.request_time',
  description: 'The round trip time of world state requests',
  unit: 'us',
  valueType: ValueType.INT,
};
export const WORLD_STATE_CRITICAL_ERROR_COUNT: MetricDefinition = {
  name: 'aztec.world_state.critical_error_count',
  description: 'The number of critical errors in the world state',
  valueType: ValueType.INT,
};

export const PROOF_VERIFIER_COUNT: MetricDefinition = {
  name: 'aztec.proof_verifier.count',
  description: 'Number of proofs verified',
  valueType: ValueType.INT,
};

export const VALIDATOR_RE_EXECUTION_TIME: MetricDefinition = {
  name: 'aztec.validator.re_execution_time',
  description: 'The time taken to re-execute a transaction',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const VALIDATOR_RE_EXECUTION_MANA: MetricDefinition = {
  name: 'aztec.validator.re_execution_mana',
  description: 'The mana consumed by blocks',
  unit: 'Mmana',
  valueType: ValueType.DOUBLE,
};
export const VALIDATOR_RE_EXECUTION_TX_COUNT: MetricDefinition = {
  name: 'aztec.validator.re_execution_tx_count',
  description: 'The number of txs in a block proposal',
  unit: 'tx',
  valueType: ValueType.INT,
};

export const VALIDATOR_FAILED_REEXECUTION_COUNT: MetricDefinition = {
  name: 'aztec.validator.failed_reexecution_count',
  description: 'The number of failed re-executions',
  valueType: ValueType.INT,
};
export const VALIDATOR_ATTESTATION_SUCCESS_COUNT: MetricDefinition = {
  name: 'aztec.validator.attestation_success_count',
  description: 'The number of successful attestations',
  valueType: ValueType.INT,
};
export const VALIDATOR_ATTESTATION_FAILED_BAD_PROPOSAL_COUNT: MetricDefinition = {
  name: 'aztec.validator.attestation_failed_bad_proposal_count',
  description: 'The number of failed attestations due to invalid block proposals',
  valueType: ValueType.INT,
};
export const VALIDATOR_ATTESTATION_FAILED_NODE_ISSUE_COUNT: MetricDefinition = {
  name: 'aztec.validator.attestation_failed_node_issue_count',
  description: 'The number of failed attestations due to node issues (timeout, missing data, etc.)',
  valueType: ValueType.INT,
};

export const NODEJS_EVENT_LOOP_DELAY_MIN: MetricDefinition = {
  name: 'nodejs.eventloop.delay.min',
  description: 'Minimum delay of the event loop',
  unit: 'ns',
  valueType: ValueType.INT,
};
export const NODEJS_EVENT_LOOP_DELAY_MEAN: MetricDefinition = {
  name: 'nodejs.eventloop.delay.mean',
  description: 'Mean delay of the event loop',
  unit: 'ns',
  valueType: ValueType.INT,
};
export const NODEJS_EVENT_LOOP_DELAY_MAX: MetricDefinition = {
  name: 'nodejs.eventloop.delay.max',
  description: 'Max delay of the event loop',
  unit: 'ns',
  valueType: ValueType.INT,
};
export const NODEJS_EVENT_LOOP_DELAY_STDDEV: MetricDefinition = {
  name: 'nodejs.eventloop.delay.stddev',
  description: 'Stddev delay of the event loop',
  unit: 'ns',
  valueType: ValueType.INT,
};
export const NODEJS_EVENT_LOOP_DELAY_P50: MetricDefinition = {
  name: 'nodejs.eventloop.delay.p50',
  description: 'P50 delay of the event loop',
  unit: 'ns',
  valueType: ValueType.INT,
};
export const NODEJS_EVENT_LOOP_DELAY_P90: MetricDefinition = {
  name: 'nodejs.eventloop.delay.p90',
  description: 'P90 delay of the event loop',
  unit: 'ns',
  valueType: ValueType.INT,
};
export const NODEJS_EVENT_LOOP_DELAY_P99: MetricDefinition = {
  name: 'nodejs.eventloop.delay.p99',
  description: 'P99 delay of the event loop',
  unit: 'ns',
  valueType: ValueType.INT,
};

export const NODEJS_EVENT_LOOP_UTILIZATION: MetricDefinition = {
  name: 'nodejs.eventloop.utilization',
  description: 'How busy is the event loop',
  valueType: ValueType.DOUBLE,
};
export const NODEJS_EVENT_LOOP_TIME: MetricDefinition = {
  name: 'nodejs.eventloop.time',
  description: 'How much time the event loop has spent in a given state',
  unit: 'ms',
  valueType: ValueType.INT,
};

export const NODEJS_MEMORY_HEAP_USAGE: MetricDefinition = {
  name: 'nodejs.memory.v8_heap.usage',
  description: 'Memory used by the V8 heap',
  unit: 'By',
};
export const NODEJS_MEMORY_HEAP_TOTAL: MetricDefinition = {
  name: 'nodejs.memory.v8_heap.total',
  description: 'The max size the V8 heap can grow to',
  unit: 'By',
};
export const NODEJS_MEMORY_NATIVE_USAGE: MetricDefinition = {
  name: 'nodejs.memory.native.usage',
  description: 'Memory allocated for native C++ objects',
  unit: 'By',
};
export const NODEJS_MEMORY_BUFFER_USAGE: MetricDefinition = {
  name: 'nodejs.memory.array_buffer.usage',
  description: 'Memory allocated for buffers (includes native memory used)',
  unit: 'By',
};

export const TX_PROVIDER_TXS_FROM_PROPOSALS_COUNT: MetricDefinition = {
  name: 'aztec.tx_collector.txs_from_proposal_count',
  description: 'The number of txs taken from block proposals',
  valueType: ValueType.INT,
};
export const TX_PROVIDER_TXS_FROM_MEMPOOL_COUNT: MetricDefinition = {
  name: 'aztec.tx_collector.txs_from_mempool_count',
  description: 'The number of txs taken from the local mempool',
  valueType: ValueType.INT,
};
export const TX_PROVIDER_TXS_FROM_P2P_COUNT: MetricDefinition = {
  name: 'aztec.tx_collector.txs_from_p2p_count',
  description: 'The number of txs taken from the p2p network',
  valueType: ValueType.INT,
};
export const TX_PROVIDER_MISSING_TXS_COUNT: MetricDefinition = {
  name: 'aztec.tx_collector.missing_txs_count',
  description: 'The number of txs not found anywhere',
  valueType: ValueType.INT,
};
export const TX_PROVIDER_P2P_TXS_REQUESTED_FRACTION: MetricDefinition = {
  name: 'aztec.tx_collector.txs_requested_fraction',
  description: 'The fraction of transaction requested from peers',
  valueType: ValueType.DOUBLE,
};
export const TX_PROVIDER_P2P_TXS_REQUEST_DELAY: MetricDefinition = {
  name: 'aztec.tx_collector.txs_requested_delay',
  description: 'The time it took to request missing transactions from p2p',
  unit: 'ms',
  valueType: ValueType.INT,
};

export const TX_COLLECTOR_COUNT: MetricDefinition = {
  name: 'aztec.tx_collector.tx_count',
  description: 'The number of txs collected',
  valueType: ValueType.INT,
};
export const TX_COLLECTOR_DURATION_PER_REQUEST: MetricDefinition = {
  name: 'aztec.tx_collector.duration_per_request',
  description: 'Total duration of an individual tx collection request',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const TX_COLLECTOR_DURATION_PER_TX: MetricDefinition = {
  name: 'aztec.tx_collector.duration_per_tx',
  description: 'Average duration per tx of an individual tx collection request',
  unit: 'ms',
  valueType: ValueType.INT,
};

export const TX_FILE_STORE_UPLOADS_SUCCESS: MetricDefinition = {
  name: 'aztec.p2p.tx_file_store.uploads_success',
  description: 'Number of successful tx uploads to file storage',
  valueType: ValueType.INT,
};
export const TX_FILE_STORE_UPLOADS_FAILED: MetricDefinition = {
  name: 'aztec.p2p.tx_file_store.uploads_failed',
  description: 'Number of failed tx uploads to file storage',
  valueType: ValueType.INT,
};
export const TX_FILE_STORE_UPLOADS_SKIPPED: MetricDefinition = {
  name: 'aztec.p2p.tx_file_store.uploads_skipped',
  description: 'Number of tx uploads skipped (duplicates)',
  valueType: ValueType.INT,
};
export const TX_FILE_STORE_UPLOAD_DURATION: MetricDefinition = {
  name: 'aztec.p2p.tx_file_store.upload_duration',
  description: 'Duration to upload a tx to file storage',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const TX_FILE_STORE_QUEUE_SIZE: MetricDefinition = {
  name: 'aztec.p2p.tx_file_store.queue_size',
  description: 'Number of txs pending upload',
  valueType: ValueType.INT,
};
export const TX_FILE_STORE_DOWNLOADS_SUCCESS: MetricDefinition = {
  name: 'aztec.p2p.tx_file_store.downloads_success',
  description: 'Number of successful tx downloads from file storage',
  valueType: ValueType.INT,
};
export const TX_FILE_STORE_DOWNLOADS_FAILED: MetricDefinition = {
  name: 'aztec.p2p.tx_file_store.downloads_failed',
  description: 'Number of failed tx downloads from file storage',
  valueType: ValueType.INT,
};
export const TX_FILE_STORE_DOWNLOAD_DURATION: MetricDefinition = {
  name: 'aztec.p2p.tx_file_store.download_duration',
  description: 'Duration to download a tx from file storage',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const TX_FILE_STORE_DOWNLOAD_SIZE: MetricDefinition = {
  name: 'aztec.p2p.tx_file_store.download_size',
  description: 'Size of a downloaded tx from file storage',
  unit: 'By',
  valueType: ValueType.INT,
};

export const IVC_VERIFIER_TIME: MetricDefinition = {
  name: 'aztec.ivc_verifier.time',
  description: 'Duration to verify chonk proofs',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const IVC_VERIFIER_TOTAL_TIME: MetricDefinition = {
  name: 'aztec.ivc_verifier.total_time',
  description: 'Total duration to verify chonk proofs, including serde',
  unit: 'ms',
  valueType: ValueType.INT,
};
export const IVC_VERIFIER_FAILURE_COUNT: MetricDefinition = {
  name: 'aztec.ivc_verifier.failure_count',
  description: 'Count of failed IVC proof verifications',
  valueType: ValueType.INT,
};

export const IVC_VERIFIER_AGG_DURATION_MIN: MetricDefinition = {
  name: 'aztec.ivc_verifier.agg_duration_min',
  description: 'MIN ivc verification',
  unit: 'ms',
  valueType: ValueType.DOUBLE,
};
export const IVC_VERIFIER_AGG_DURATION_MAX: MetricDefinition = {
  name: 'aztec.ivc_verifier.agg_duration_max',
  description: 'MAX ivc verification',
  unit: 'ms',
  valueType: ValueType.DOUBLE,
};
export const IVC_VERIFIER_AGG_DURATION_P50: MetricDefinition = {
  name: 'aztec.ivc_verifier.agg_duration_p50',
  description: 'P50 ivc verification',
  unit: 'ms',
  valueType: ValueType.DOUBLE,
};
export const IVC_VERIFIER_AGG_DURATION_P90: MetricDefinition = {
  name: 'aztec.ivc_verifier.agg_duration_p90',
  description: 'P90 ivc verification',
  unit: 'ms',
  valueType: ValueType.DOUBLE,
};
export const IVC_VERIFIER_AGG_DURATION_AVG: MetricDefinition = {
  name: 'aztec.ivc_verifier.agg_duration_avg',
  description: 'AVG ivc verification',
  unit: 'ms',
  valueType: ValueType.DOUBLE,
};
