/**
 * @overview This file contains the custom attributes used in telemetry events.
 * Attribute names exist in a global namespace, alongside metric names. Use this file to ensure that attribute names are unique.
 *
 * To define a new attribute follow these steps:
 * 1. Make sure it's not a semantic attribute that's already been defined by {@link @opentelemetry/semantic-conventions | OpenTelemetry} (e.g. `service.name`)
 * 2. Come up with a unique name for it so that it doesn't clash with other attributes or metrics.
 * 3. Prefix the attribute name with `aztec` to make it clear that it's a custom attribute.
 * 4. Add a description of what the attribute represents and examples of what it might contain.
 * 5. Start using it.
 *
 * @note Attributes and metric names exist in a hierarchy of namespaces. If a name has been used as a namespace, then it can not be used as a name for an attribute or metric.
 * @example If `aztec.circuit.name` has been defined as an attribute then `aztec.circuit` alone can not be re-used for a metric or attribute because it is already a namespace.
 * @see {@link https://opentelemetry.io/docs/specs/semconv/general/attribute-naming/}
 */

/** The host of an HTTP request */
export const HTTP_REQUEST_HOST = 'http.header.request.host';
export const HTTP_RESPONSE_STATUS_CODE = 'http.response.status_code';

/** The Aztec network identifier */
export const NETWORK_NAME = 'aztec.network_name';

export const AZTEC_NODE_ROLE = 'aztec.node_role';
export const AZTEC_ROLLUP_VERSION = 'aztec.rollup_version';
export const AZTEC_ROLLUP_ADDRESS = 'aztec.rollup_address';
export const AZTEC_REGISTRY_ADDRESS = 'aztec.registry_address';

/**
 * The name of the protocol circuit being run (e.g. public-kernel-setup or base-rollup)
 * @see {@link @aztec/stdlib/stats:CircuitName}
 */
export const PROTOCOL_CIRCUIT_NAME = 'aztec.circuit.protocol_circuit_name';

/**
 * For an app circuit, the contract:function being run (e.g. Token:transfer)
 */
export const APP_CIRCUIT_NAME = 'aztec.circuit.app_circuit_name';

/** The block archive */
export const BLOCK_ARCHIVE = 'aztec.block.archive';
/** The block number */
export const BLOCK_NUMBER = 'aztec.block.number';
/** The slot number */
export const SLOT_NUMBER = 'aztec.slot.number';
/** The parent's block number */
export const BLOCK_PARENT = 'aztec.block.parent';
/** How many txs are being processed to build this block */
export const BLOCK_CANDIDATE_TXS_COUNT = 'aztec.block.candidate_txs_count';
/** How many actual txs were included in this block */
export const BLOCK_TXS_COUNT = 'aztec.block.txs_count';
/** The block size */
export const BLOCK_SIZE = 'aztec.block.size';
/** How many blocks are included in this epoch */
export const EPOCH_SIZE = 'aztec.epoch.size';
/** The proposer of a block */
export const BLOCK_PROPOSER = 'aztec.block.proposer';
/** The epoch number */
export const EPOCH_NUMBER = 'aztec.epoch.number';
/** The tx hash */
export const TX_HASH = 'aztec.tx.hash';
/** Generic attribute representing whether the action was successful or not */
export const OK = 'aztec.ok';
/** Generic status attribute */
export const STATUS = 'aztec.status';
/** Generic error type attribute */
export const ERROR_TYPE = 'aztec.error_type';
/** The type of the transaction */
export const L1_TX_TYPE = 'aztec.l1.tx_type';
/** The L1 address of the entity that sent a transaction to L1 */
export const L1_SENDER = 'aztec.l1.sender';
/** The L1 address receiving rewards */
export const COINBASE = 'aztec.coinbase';
/** The phase of the transaction */
export const TX_PHASE_NAME = 'aztec.tx.phase_name';
/** The reason for disconnecting a peer */
export const P2P_GOODBYE_REASON = 'aztec.p2p.goodbye.reason';
/** The proving job type */
export const PROVING_JOB_TYPE = 'aztec.proving.job_type';
/** The proving job id */
export const PROVING_JOB_ID = 'aztec.proving.job_id';

export const MERKLE_TREE_NAME = 'aztec.merkle_tree.name';
/** The prover-id in a root rollup proof. */
export const ROLLUP_PROVER_ID = 'aztec.rollup.prover_id';
/** Whether the proof submission was timed out (delayed more than 20 min) */
export const PROOF_TIMED_OUT = 'aztec.proof.timed_out';

export const P2P_ID = 'aztec.p2p.id';
export const P2P_REQ_RESP_PROTOCOL = 'aztec.p2p.req_resp.protocol';
export const P2P_REQ_RESP_BATCH_REQUESTS_COUNT = 'aztec.p2p.req_resp.batch_requests_count';
export const POOL_NAME = 'aztec.pool.name';

export const SEQUENCER_STATE = 'aztec.sequencer.state';

export const SIMULATOR_PHASE = 'aztec.simulator.phase';
export const TARGET_ADDRESS = 'aztec.address.target';
export const SENDER_ADDRESS = 'aztec.address.sender';
export const MANA_USED = 'aztec.mana.used';
export const TOTAL_INSTRUCTIONS = 'aztec.total_instructions';

/** Whether a sync process is the initial run, which is usually slower than iterative ones. */
export const INITIAL_SYNC = 'aztec.initial_sync';

/** Identifier for the tables in a world state DB */
export const WS_DB_DATA_TYPE = 'aztec.world_state.db_type';

/** Identifier for component database (e.g. archiver, tx pool) */
export const DB_DATA_TYPE = 'aztec.db_type';

export const REVERTIBILITY = 'aztec.revertibility';

export const GAS_DIMENSION = 'aztec.gas_dimension';

export const WORLD_STATE_REQUEST_TYPE = 'aztec.world_state_request';

export const NODEJS_EVENT_LOOP_STATE = 'nodejs.eventloop.state';

export const TOPIC_NAME = 'aztec.gossip.topic_name';

export const TX_COLLECTION_METHOD = 'aztec.tx_collection.method';
