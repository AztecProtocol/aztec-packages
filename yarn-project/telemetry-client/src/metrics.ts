/**
 * @file Metric names used in Aztec.
 * Metric names must be unique and not clash with {@link attributes.ts | Attribute names}.
 * Prefix metric names with `aztec` and use dots `.` to separate namespaces.
 *
 * @see {@link https://opentelemetry.io/docs/specs/semconv/general/metrics/ | OpenTelemetry Metrics} for naming conventions.
 */

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
export const MEMPOOL_DB_NUM_ITEMS = 'aztec.mempool.db.num_items';
export const MEMPOOL_DB_MAP_SIZE = 'aztec.mempool.db.map_size';
export const MEMPOOL_DB_USED_SIZE = 'aztec.mempool.db.used_size';

export const MEMPOOL_ATTESTATIONS_COUNT = 'aztec.mempool.attestations_count';
export const MEMPOOL_ATTESTATIONS_SIZE = 'aztec.mempool.attestations_size';

export const MEMPOOL_PROVER_QUOTE_COUNT = 'aztec.mempool.prover_quote_count';
export const MEMPOOL_PROVER_QUOTE_SIZE = 'aztec.mempool.prover_quote_size';

export const ARCHIVER_SYNC_DURATION = 'aztec.archiver.sync_duration';
export const ARCHIVER_BLOCK_HEIGHT = 'aztec.archiver.block_height';
export const ARCHIVER_BLOCK_SIZE = 'aztec.archiver.block_size';
export const ARCHIVER_ROLLUP_PROOF_DELAY = 'aztec.archiver.rollup_proof_delay';
export const ARCHIVER_ROLLUP_PROOF_COUNT = 'aztec.archiver.rollup_proof_count';
export const ARCHIVER_DB_NUM_ITEMS = 'aztec.archiver.db.num_items';
export const ARCHIVER_DB_MAP_SIZE = 'aztec.archiver.db.map_size';
export const ARCHIVER_DB_USED_SIZE = 'aztec.archiver.db.used_size';

export const NODE_RECEIVE_TX_DURATION = 'aztec.node.receive_tx.duration';
export const NODE_RECEIVE_TX_COUNT = 'aztec.node.receive_tx.count';

export const SEQUENCER_STATE_TRANSITION_BUFFER_DURATION = 'aztec.sequencer.state_transition_buffer.duration';
export const SEQUENCER_BLOCK_BUILD_DURATION = 'aztec.sequencer.block.build_duration';
export const SEQUENCER_BLOCK_COUNT = 'aztec.sequencer.block.count';
export const SEQUENCER_CURRENT_STATE = 'aztec.sequencer.current.state';
export const SEQUENCER_CURRENT_BLOCK_NUMBER = 'aztec.sequencer.current.block_number';
export const SEQUENCER_CURRENT_BLOCK_SIZE = 'aztec.sequencer.current.block_size';
export const SEQUENCER_TIME_TO_COLLECT_ATTESTATIONS = 'aztec.sequencer.time_to_collect_attestations';

export const L1_PUBLISHER_GAS_PRICE = 'aztec.l1_publisher.gas_price';
export const L1_PUBLISHER_TX_COUNT = 'aztec.l1_publisher.tx_count';
export const L1_PUBLISHER_TX_DURATION = 'aztec.l1_publisher.tx_duration';
export const L1_PUBLISHER_TX_GAS = 'aztec.l1_publisher.tx_gas';
export const L1_PUBLISHER_TX_CALLDATA_SIZE = 'aztec.l1_publisher.tx_calldata_size';
export const L1_PUBLISHER_TX_CALLDATA_GAS = 'aztec.l1_publisher.tx_calldata_gas';

export const PUBLIC_PROCESSOR_TX_DURATION = 'aztec.public_processor.tx_duration';
export const PUBLIC_PROCESSOR_TX_COUNT = 'aztec.public_processor.tx_count';
export const PUBLIC_PROCESSOR_TX_PHASE_COUNT = 'aztec.public_processor.tx_phase_count';
export const PUBLIC_PROCESSOR_PHASE_DURATION = 'aztec.public_processor.phase_duration';
export const PUBLIC_PROCESSOR_PHASE_COUNT = 'aztec.public_processor.phase_count';
export const PUBLIC_PROCESSOR_DEPLOY_BYTECODE_SIZE = 'aztec.public_processor.deploy_bytecode_size';

export const PUBLIC_EXECUTOR_SIMULATION_COUNT = 'aztec.public_executor.simulation_count';
export const PUBLIC_EXECUTOR_SIMULATION_DURATION = 'aztec.public_executor.simulation_duration';
export const PUBLIC_EXECUTOR_SIMULATION_MANA_PER_SECOND = 'aztec.public_executor.simulation_mana_per_second';
export const PUBLIC_EXECUTION_SIMULATION_BYTECODE_SIZE = 'aztec.public_executor.simulation_bytecode_size';

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

export const PROVER_NODE_JOB_DURATION = 'aztec.prover_node.job_duration';

export const WORLD_STATE_FORK_DURATION = 'aztec.world_state.fork.duration';
export const WORLD_STATE_SYNC_DURATION = 'aztec.world_state.sync.duration';
export const WORLD_STATE_MERKLE_TREE_SIZE = 'aztec.world_state.merkle_tree_size';
export const WORLD_STATE_DB_SIZE = 'aztec.world_state.db_size';

export const WORLD_STATE_DB_MAP_SIZE_NULLIFIER = 'aztec.world_state.db_map_size.nullifier';
export const WORLD_STATE_DB_MAP_SIZE_PUBLIC_DATA = 'aztec.world_state.db_map_size.public_data';
export const WORLD_STATE_DB_MAP_SIZE_ARCHIVE = 'aztec.world_state.db_map_size.archive';
export const WORLD_STATE_DB_MAP_SIZE_MESSAGE = 'aztec.world_state.db_map_size.message';
export const WORLD_STATE_DB_MAP_SIZE_NOTE_HASH = 'aztec.world_state.db_map_size.note_hash';

export const WORLD_STATE_TREE_SIZE_NULLIFIER = 'aztec.world_state.tree_size.nullifier';
export const WORLD_STATE_TREE_SIZE_PUBLIC_DATA = 'aztec.world_state.tree_size.public_data';
export const WORLD_STATE_TREE_SIZE_ARCHIVE = 'aztec.world_state.tree_size.archive';
export const WORLD_STATE_TREE_SIZE_MESSAGE = 'aztec.world_state.tree_size.message';
export const WORLD_STATE_TREE_SIZE_NOTE_HASH = 'aztec.world_state.tree_size.note_hash';

export const WORLD_STATE_UNFINALISED_HEIGHT_NULLIFIER = 'aztec.world_state.unfinalised_height.nullifier';
export const WORLD_STATE_UNFINALISED_HEIGHT_PUBLIC_DATA = 'aztec.world_state.unfinalised_height.public_data';
export const WORLD_STATE_UNFINALISED_HEIGHT_ARCHIVE = 'aztec.world_state.unfinalised_height.archive';
export const WORLD_STATE_UNFINALISED_HEIGHT_MESSAGE = 'aztec.world_state.unfinalised_height.message';
export const WORLD_STATE_UNFINALISED_HEIGHT_NOTE_HASH = 'aztec.world_state.unfinalised_height.note_hash';

export const WORLD_STATE_FINALISED_HEIGHT_NULLIFIER = 'aztec.world_state.finalised_height.nullifier';
export const WORLD_STATE_FINALISED_HEIGHT_PUBLIC_DATA = 'aztec.world_state.finalised_height.public_data';
export const WORLD_STATE_FINALISED_HEIGHT_ARCHIVE = 'aztec.world_state.finalised_height.archive';
export const WORLD_STATE_FINALISED_HEIGHT_MESSAGE = 'aztec.world_state.finalised_height.message';
export const WORLD_STATE_FINALISED_HEIGHT_NOTE_HASH = 'aztec.world_state.finalised_height.note_hash';

export const WORLD_STATE_OLDEST_BLOCK_NULLIFIER = 'aztec.world_state.oldest_block.nullifier';
export const WORLD_STATE_OLDEST_BLOCK_PUBLIC_DATA = 'aztec.world_state.oldest_block.public_data';
export const WORLD_STATE_OLDEST_BLOCK_ARCHIVE = 'aztec.world_state.oldest_block.archive';
export const WORLD_STATE_OLDEST_BLOCK_MESSAGE = 'aztec.world_state.oldest_block.message';
export const WORLD_STATE_OLDEST_BLOCK_NOTE_HASH = 'aztec.world_state.oldest_block.note_hash';

export const WORLD_STATE_BLOCKS_DB_USED_SIZE_NULLIFIER = 'aztec.world_state.db_used_size.blocks.nullifier';
export const WORLD_STATE_BLOCKS_DB_USED_SIZE_PUBLIC_DATA = 'aztec.world_state.db_used_size.blocks.public_data';
export const WORLD_STATE_BLOCKS_DB_USED_SIZE_ARCHIVE = 'aztec.world_state.db_used_size.blocks.archive';
export const WORLD_STATE_BLOCKS_DB_USED_SIZE_MESSAGE = 'aztec.world_state.db_used_size.blocks.message';
export const WORLD_STATE_BLOCKS_DB_USED_SIZE_NOTE_HASH = 'aztec.world_state.db_used_size.blocks.note_hash';

export const WORLD_STATE_BLOCKS_DB_NUM_ITEMS_NULLIFIER = 'aztec.world_state.db_num_items.blocks.nullifier';
export const WORLD_STATE_BLOCKS_DB_NUM_ITEMS_PUBLIC_DATA = 'aztec.world_state.db_num_items.blocks.public_data';
export const WORLD_STATE_BLOCKS_DB_NUM_ITEMS_ARCHIVE = 'aztec.world_state.db_num_items.blocks.archive';
export const WORLD_STATE_BLOCKS_DB_NUM_ITEMS_MESSAGE = 'aztec.world_state.db_num_items.blocks.message';
export const WORLD_STATE_BLOCKS_DB_NUM_ITEMS_NOTE_HASH = 'aztec.world_state.db_num_items.blocks.note_hash';

export const WORLD_STATE_NODES_DB_USED_SIZE_NULLIFIER = 'aztec.world_state.db_used_size.nodes.nullifier';
export const WORLD_STATE_NODES_DB_USED_SIZE_PUBLIC_DATA = 'aztec.world_state.db_used_size.nodes.public_data';
export const WORLD_STATE_NODES_DB_USED_SIZE_ARCHIVE = 'aztec.world_state.db_used_size.nodes.archive';
export const WORLD_STATE_NODES_DB_USED_SIZE_MESSAGE = 'aztec.world_state.db_used_size.nodes.message';
export const WORLD_STATE_NODES_DB_USED_SIZE_NOTE_HASH = 'aztec.world_state.db_used_size.nodes.note_hash';

export const WORLD_STATE_NODES_DB_NUM_ITEMS_NULLIFIER = 'aztec.world_state.db_num_items.nodes.nullifier';
export const WORLD_STATE_NODES_DB_NUM_ITEMS_PUBLIC_DATA = 'aztec.world_state.db_num_items.nodes.public_data';
export const WORLD_STATE_NODES_DB_NUM_ITEMS_ARCHIVE = 'aztec.world_state.db_num_items.nodes.archive';
export const WORLD_STATE_NODES_DB_NUM_ITEMS_MESSAGE = 'aztec.world_state.db_num_items.nodes.message';
export const WORLD_STATE_NODES_DB_NUM_ITEMS_NOTE_HASH = 'aztec.world_state.db_num_items.nodes.note_hash';

export const WORLD_STATE_LEAF_PREIMAGE_DB_USED_SIZE_NULLIFIER =
  'aztec.world_state.db_used_size.leaf_preimage.nullifier';
export const WORLD_STATE_LEAF_PREIMAGE_DB_USED_SIZE_PUBLIC_DATA =
  'aztec.world_state.db_used_size.leaf_preimage.public_data';
export const WORLD_STATE_LEAF_PREIMAGE_DB_USED_SIZE_ARCHIVE = 'aztec.world_state.db_used_size.leaf_preimage.archive';
export const WORLD_STATE_LEAF_PREIMAGE_DB_USED_SIZE_MESSAGE = 'aztec.world_state.db_used_size.leaf_preimage.message';
export const WORLD_STATE_LEAF_PREIMAGE_DB_USED_SIZE_NOTE_HASH =
  'aztec.world_state.db_used_size.leaf_preimage.note_hash';

export const WORLD_STATE_LEAF_PREIMAGE_DB_NUM_ITEMS_NULLIFIER =
  'aztec.world_state.db_num_items.leaf_preimage.nullifier';
export const WORLD_STATE_LEAF_PREIMAGE_DB_NUM_ITEMS_PUBLIC_DATA =
  'aztec.world_state.db_num_items.leaf_preimage.public_data';
export const WORLD_STATE_LEAF_PREIMAGE_DB_NUM_ITEMS_ARCHIVE = 'aztec.world_state.db_num_items.leaf_preimage.archive';
export const WORLD_STATE_LEAF_PREIMAGE_DB_NUM_ITEMS_MESSAGE = 'aztec.world_state.db_num_items.leaf_preimage.message';
export const WORLD_STATE_LEAF_PREIMAGE_DB_NUM_ITEMS_NOTE_HASH =
  'aztec.world_state.db_num_items.leaf_preimage.note_hash';

export const WORLD_STATE_LEAF_INDICES_DB_USED_SIZE_NULLIFIER = 'aztec.world_state.db_used_size.leaf_indices.nullifier';
export const WORLD_STATE_LEAF_INDICES_DB_USED_SIZE_PUBLIC_DATA =
  'aztec.world_state.db_used_size.leaf_indices.public_data';
export const WORLD_STATE_LEAF_INDICES_DB_USED_SIZE_ARCHIVE = 'aztec.world_state.db_used_size.leaf_indices.archive';
export const WORLD_STATE_LEAF_INDICES_DB_USED_SIZE_MESSAGE = 'aztec.world_state.db_used_size.leaf_indices.message';
export const WORLD_STATE_LEAF_INDICES_DB_USED_SIZE_NOTE_HASH = 'aztec.world_state.db_used_size.leaf_indices.note_hash';

export const WORLD_STATE_LEAF_INDICES_DB_NUM_ITEMS_NULLIFIER = 'aztec.world_state.db_num_items.leaf_indices.nullifier';
export const WORLD_STATE_LEAF_INDICES_DB_NUM_ITEMS_PUBLIC_DATA =
  'aztec.world_state.db_num_items.leaf_indices.public_data';
export const WORLD_STATE_LEAF_INDICES_DB_NUM_ITEMS_ARCHIVE = 'aztec.world_state.db_num_items.leaf_indices.archive';
export const WORLD_STATE_LEAF_INDICES_DB_NUM_ITEMS_MESSAGE = 'aztec.world_state.db_num_items.leaf_indices.message';
export const WORLD_STATE_LEAF_INDICES_DB_NUM_ITEMS_NOTE_HASH = 'aztec.world_state.db_num_items.leaf_indices.note_hash';

export const WORLD_STATE_BLOCK_INDICES_DB_USED_SIZE_NULLIFIER =
  'aztec.world_state.db_used_size.block_indices.nullifier';
export const WORLD_STATE_BLOCK_INDICES_DB_USED_SIZE_PUBLIC_DATA =
  'aztec.world_state.db_used_size.block_indices.public_data';
export const WORLD_STATE_BLOCK_INDICES_DB_USED_SIZE_ARCHIVE = 'aztec.world_state.db_used_size.block_indices.archive';
export const WORLD_STATE_BLOCK_INDICES_DB_USED_SIZE_MESSAGE = 'aztec.world_state.db_used_size.block_indices.message';
export const WORLD_STATE_BLOCK_INDICES_DB_USED_SIZE_NOTE_HASH =
  'aztec.world_state.db_used_size.block_indices.note_hash';

export const WORLD_STATE_BLOCK_INDICES_DB_NUM_ITEMS_NULLIFIER =
  'aztec.world_state.db_num_items.block_indices.nullifier';
export const WORLD_STATE_BLOCK_INDICES_DB_NUM_ITEMS_PUBLIC_DATA =
  'aztec.world_state.db_num_items.block_indices.public_data';
export const WORLD_STATE_BLOCK_INDICES_DB_NUM_ITEMS_ARCHIVE = 'aztec.world_state.db_num_items.block_indices.archive';
export const WORLD_STATE_BLOCK_INDICES_DB_NUM_ITEMS_MESSAGE = 'aztec.world_state.db_num_items.block_indices.message';
export const WORLD_STATE_BLOCK_INDICES_DB_NUM_ITEMS_NOTE_HASH =
  'aztec.world_state.db_num_items.block_indices.note_hash';

export const PROOF_VERIFIER_COUNT = 'aztec.proof_verifier.count';

export const VALIDATOR_RE_EXECUTION_TIME = 'aztec.validator.re_execution_time';
export const VALIDATOR_FAILED_REEXECUTION_COUNT = 'aztec.validator.failed_reexecution_count';
