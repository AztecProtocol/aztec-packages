/**
 * @file Metric names used in Aztec.
 * Metric names must be unique and not clash with {@link attributes.ts | Attribute names}.
 * Prefix metric names with `aztec` and use dots `.` to separate namespaces.
 *
 * @see {@link https://opentelemetry.io/docs/specs/semconv/general/metrics/ | OpenTelemetry Metrics} for naming conventions.
 */

export const BLOB_SINK_OBJECTS_IN_BLOB_STORE = 'aztec.blob_sink.objects_in_blob_store';
export const BLOB_SINK_BLOB_SIZE = 'aztec.blob_sink.blob_size';

/** How long it takes to simulate a circuit */
export const CIRCUIT_SIMULATION_DURATION = 'aztec.circuit.simulation.duration';
export const CIRCUIT_SIMULATION_INPUT_SIZE = 'aztec.circuit.simulation.input_size';
export const CIRCUIT_SIMULATION_OUTPUT_SIZE = 'aztec.circuit.simulation.output_size';

export const CIRCUIT_WITNESS_GEN_DURATION = 'aztec.circuit.witness_generation.duration';
export const CIRCUIT_WITNESS_GEN_INPUT_SIZE = 'aztec.circuit.witness_generation.input_size';
export const CIRCUIT_WITNESS_GEN_OUTPUT_SIZE = 'aztec.circuit.witness_generation.output_size';

export const CIRCUIT_PROVING_DURATION = 'aztec.circuit.proving.duration';
export const CIRCUIT_PROVING_INPUT_SIZE = 'aztec.circuit.proving.input_size';
export const CIRCUIT_PROVING_PROOF_SIZE = 'aztec.circuit.proving.proof_size';

export const CIRCUIT_PUBLIC_INPUTS_COUNT = 'aztec.circuit.public_inputs_count';
export const CIRCUIT_GATE_COUNT = 'aztec.circuit.gate_count';
export const CIRCUIT_SIZE = 'aztec.circuit.size';

export const MEMPOOL_TX_COUNT = 'aztec.mempool.tx_count';
export const MEMPOOL_TX_SIZE = 'aztec.mempool.tx_size';
export const DB_NUM_ITEMS = 'aztec.db.num_items';
export const DB_MAP_SIZE = 'aztec.db.map_size';
export const DB_USED_SIZE = 'aztec.db.used_size';

export const MEMPOOL_ATTESTATIONS_COUNT = 'aztec.mempool.attestations_count';
export const MEMPOOL_ATTESTATIONS_SIZE = 'aztec.mempool.attestations_size';

export const MEMPOOL_PROVER_QUOTE_COUNT = 'aztec.mempool.prover_quote_count';
export const MEMPOOL_PROVER_QUOTE_SIZE = 'aztec.mempool.prover_quote_size';

export const ARCHIVER_SYNC_DURATION = 'aztec.archiver.sync_duration';
export const ARCHIVER_L1_BLOCKS_SYNCED = 'aztec.archiver.l1_blocks_synced';
export const ARCHIVER_BLOCK_HEIGHT = 'aztec.archiver.block_height';
export const ARCHIVER_TX_COUNT = 'aztec.archiver.tx_count';
export const ARCHIVER_ROLLUP_PROOF_DELAY = 'aztec.archiver.rollup_proof_delay';
export const ARCHIVER_ROLLUP_PROOF_COUNT = 'aztec.archiver.rollup_proof_count';
export const ARCHIVER_PRUNE_COUNT = 'aztec.archiver.prune_count';

export const NODE_RECEIVE_TX_DURATION = 'aztec.node.receive_tx.duration';
export const NODE_RECEIVE_TX_COUNT = 'aztec.node.receive_tx.count';

export const SEQUENCER_STATE_TRANSITION_BUFFER_DURATION = 'aztec.sequencer.state_transition_buffer.duration';
export const SEQUENCER_BLOCK_BUILD_DURATION = 'aztec.sequencer.block.build_duration';
export const SEQUENCER_BLOCK_COUNT = 'aztec.sequencer.block.count';
export const SEQUENCER_CURRENT_STATE = 'aztec.sequencer.current.state';
export const SEQUENCER_CURRENT_BLOCK_NUMBER = 'aztec.sequencer.current.block_number';
export const SEQUENCER_CURRENT_BLOCK_SIZE = 'aztec.sequencer.current.block_size';
export const SEQUENCER_TIME_TO_COLLECT_ATTESTATIONS = 'aztec.sequencer.time_to_collect_attestations';
export const SEQUENCER_BLOCK_BUILD_INSERTION_TIME = 'aztec.sequencer.block_builder_tree_insertion_duration';

export const L1_PUBLISHER_GAS_PRICE = 'aztec.l1_publisher.gas_price';
export const L1_PUBLISHER_TX_COUNT = 'aztec.l1_publisher.tx_count';
export const L1_PUBLISHER_TX_DURATION = 'aztec.l1_publisher.tx_duration';
export const L1_PUBLISHER_TX_GAS = 'aztec.l1_publisher.tx_gas';
export const L1_PUBLISHER_TX_CALLDATA_SIZE = 'aztec.l1_publisher.tx_calldata_size';
export const L1_PUBLISHER_TX_CALLDATA_GAS = 'aztec.l1_publisher.tx_calldata_gas';
export const L1_PUBLISHER_TX_BLOBDATA_GAS_USED = 'aztec.l1_publisher.tx_blobdata_gas_used';
export const L1_PUBLISHER_TX_BLOBDATA_GAS_COST = 'aztec.l1_publisher.tx_blobdata_gas_cost';

export const PUBLIC_PROCESSOR_TX_DURATION = 'aztec.public_processor.tx_duration';
export const PUBLIC_PROCESSOR_TX_COUNT = 'aztec.public_processor.tx_count';
export const PUBLIC_PROCESSOR_TX_PHASE_COUNT = 'aztec.public_processor.tx_phase_count';
export const PUBLIC_PROCESSOR_TX_GAS = 'aztec.public_processor.tx_gas';
export const PUBLIC_PROCESSOR_PHASE_DURATION = 'aztec.public_processor.phase_duration';
export const PUBLIC_PROCESSOR_PHASE_COUNT = 'aztec.public_processor.phase_count';
export const PUBLIC_PROCESSOR_DEPLOY_BYTECODE_SIZE = 'aztec.public_processor.deploy_bytecode_size';
export const PUBLIC_PROCESSOR_TOTAL_GAS = 'aztec.public_processor.total_gas';
export const PUBLIC_PROCESSOR_TOTAL_GAS_HISTOGRAM = 'aztec.public_processor.total_gas_histogram';
export const PUBLIC_PROCESSOR_GAS_RATE = 'aztec.public_processor.gas_rate';
export const PUBLIC_PROCESSOR_TREE_INSERTION = 'aztec.public_processor.tree_insertion';

export const PUBLIC_EXECUTOR_SIMULATION_COUNT = 'aztec.public_executor.simulation_count';
export const PUBLIC_EXECUTOR_SIMULATION_DURATION = 'aztec.public_executor.simulation_duration';
export const PUBLIC_EXECUTOR_SIMULATION_MANA_PER_SECOND = 'aztec.public_executor.simulation_mana_per_second';
export const PUBLIC_EXECUTION_SIMULATION_BYTECODE_SIZE = 'aztec.public_executor.simulation_bytecode_size';
export const PUBLIC_EXECUTION_PRIVATE_EFFECTS_INSERTION = 'aztec.public_executor.private_effects_insertion';

export const PROVING_ORCHESTRATOR_BASE_ROLLUP_INPUTS_DURATION =
  'aztec.proving_orchestrator.base_rollup.inputs_duration';

export const PROVING_QUEUE_JOB_SIZE = 'aztec.proving_queue.job_size';
export const PROVING_QUEUE_SIZE = 'aztec.proving_queue.size';
export const PROVING_QUEUE_ACTIVE_JOBS = 'aztec.proving_queue.active_jobs';
export const PROVING_QUEUE_RESOLVED_JOBS = 'aztec.proving_queue.resolved_jobs';
export const PROVING_QUEUE_REJECTED_JOBS = 'aztec.proving_queue.rejected_jobs';
export const PROVING_QUEUE_RETRIED_JOBS = 'aztec.proving_queue.retried_jobs';
export const PROVING_QUEUE_TIMED_OUT_JOBS = 'aztec.proving_queue.timed_out_jobs';
export const PROVING_QUEUE_JOB_WAIT = 'aztec.proving_queue.job_wait';
export const PROVING_QUEUE_JOB_DURATION = 'aztec.proving_queue.job_duration';
export const PROVING_QUEUE_DB_NUM_ITEMS = 'aztec.proving_queue.db.num_items';
export const PROVING_QUEUE_DB_MAP_SIZE = 'aztec.proving_queue.db.map_size';
export const PROVING_QUEUE_DB_USED_SIZE = 'aztec.proving_queue.db.used_size';

export const PROVING_AGENT_IDLE = 'aztec.proving_queue.agent.idle';

export const PROVER_NODE_EXECUTION_DURATION = 'aztec.prover_node.execution.duration';
export const PROVER_NODE_JOB_DURATION = 'aztec.prover_node.job_duration';
export const PROVER_NODE_JOB_BLOCKS = 'aztec.prover_node.job_blocks';
export const PROVER_NODE_JOB_TRANSACTIONS = 'aztec.prover_node.job_transactions';

export const WORLD_STATE_FORK_DURATION = 'aztec.world_state.fork.duration';
export const WORLD_STATE_SYNC_DURATION = 'aztec.world_state.sync.duration';
export const WORLD_STATE_MERKLE_TREE_SIZE = 'aztec.world_state.merkle_tree_size';
export const WORLD_STATE_DB_SIZE = 'aztec.world_state.db_size';
export const WORLD_STATE_DB_MAP_SIZE = 'aztec.world_state.db_map_size';
export const WORLD_STATE_TREE_SIZE = 'aztec.world_state.tree_size';
export const WORLD_STATE_UNFINALISED_HEIGHT = 'aztec.world_state.unfinalised_height';
export const WORLD_STATE_FINALISED_HEIGHT = 'aztec.world_state.finalised_height';
export const WORLD_STATE_OLDEST_BLOCK = 'aztec.world_state.oldest_block';
export const WORLD_STATE_DB_USED_SIZE = 'aztec.world_state.db_used_size';
export const WORLD_STATE_DB_NUM_ITEMS = 'aztec.world_state.db_num_items';
export const WORLD_STATE_REQUEST_TIME = 'aztec.world_state.request_time';

export const PROOF_VERIFIER_COUNT = 'aztec.proof_verifier.count';

export const VALIDATOR_RE_EXECUTION_TIME = 'aztec.validator.re_execution_time';
export const VALIDATOR_FAILED_REEXECUTION_COUNT = 'aztec.validator.failed_reexecution_count';

export const EVENT_LOOP_UTILIZATION = 'aztec.event_loop_utilization';
export const EVENT_LOOP_LAG = 'aztec.event_loop_lag';
