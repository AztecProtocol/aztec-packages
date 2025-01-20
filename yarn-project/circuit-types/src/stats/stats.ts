/** Stats associated with an ACIR proof generation.*/
export type ProofConstructed = {
  /** Name of the event for metrics purposes */
  eventName: 'proof_construction_time';
  /** Name of the program being proven */
  acir_test: string;
  /** Number of threads used for proving */
  threads: number;
  /** Time spent proving */
  value: number;
};

/** Stats associated with an L2 block. */
export type L2BlockStats = {
  /** Number of txs in the L2 block. */
  txCount: number;
  /** Number of the L2 block. */
  blockNumber: number;
  /** Number of unencrypted logs. */
  unencryptedLogCount?: number;
  /** Serialized size of unencrypted logs. */
  unencryptedLogSize?: number;
};

/** Stats logged for each L1 publish tx.*/
export type L1PublishStats = {
  /** Address of the sender. */
  sender: string;
  /** Effective gas price of the tx. */
  gasPrice: bigint;
  /** Effective gas used in the tx. */
  gasUsed: bigint;
  /** Hash of the L1 tx. */
  transactionHash: string;
  /** Gas cost of the calldata. */
  calldataGas: number;
  /** Size in bytes of the calldata. */
  calldataSize: number;
  /** Gas cost of the blob data */
  blobDataGas: bigint;
  /** Amount of blob gas used. */
  blobGasUsed: bigint;
};

/** Stats logged for each L1 rollup publish tx.*/
export type L1PublishBlockStats = {
  /** Name of the event for metrics purposes */
  eventName: 'rollup-published-to-l1';
} & L1PublishStats &
  L2BlockStats;

/** Stats logged for each L1 rollup publish tx.*/
export type L1PublishProofStats = {
  /** Name of the event for metrics purposes */
  eventName: 'proof-published-to-l1';
} & L1PublishStats;

/** Stats logged for synching node chain history.  */
export type NodeSyncedChainHistoryStats = {
  /** Name of the event. */
  eventName: 'node-synced-chain-history';
  /** Number of txs in the L2 block.. */
  txCount: number;
  /** Number of txs in each block. */
  txsPerBlock: number;
  /** Duration in ms. */
  duration: number;
  /** Id of the L2 block. */
  blockNumber: number;
  /** Number of blocks processed. */
  blockCount: number;
  /** Size of the db in bytes. */
  dbSize: number;
};

export type ClientCircuitName =
  | 'private-kernel-init'
  | 'private-kernel-inner'
  | 'private-kernel-reset'
  | 'private-kernel-tail'
  | 'private-kernel-tail-to-public'
  | 'app-circuit';

export type ServerCircuitName =
  | 'base-parity'
  | 'root-parity'
  | 'private-base-rollup'
  | 'public-base-rollup'
  | 'merge-rollup'
  | 'block-root-rollup'
  | 'single-tx-block-root-rollup'
  | 'empty-block-root-rollup'
  | 'block-merge-rollup'
  | 'root-rollup'
  | 'avm-circuit'
  | 'tube-circuit';

export type CircuitName = ClientCircuitName | ServerCircuitName;

/** Stats for circuit simulation. */
export type CircuitSimulationStats = {
  /** name of the event. */
  eventName: 'circuit-simulation';
  /** Name of the circuit. */
  circuitName: CircuitName;
  /** Optional. The function name that's being simulated */
  appCircuitName?: string;
  /** Duration in ms. */
  duration: number;
  /** Size in bytes of circuit inputs. */
  inputSize: number;
  /** Size in bytes of circuit outputs (aka public inputs). */
  outputSize: number;
};

export type PublicDBAccessStats = {
  eventName: 'public-db-access';
  duration: number;
  operation: string;
};

export type AvmSimulationStats = {
  /** name of the event. */
  eventName: 'avm-simulation';
  /** Name of the circuit. */
  appCircuitName: string;
  /** Duration in ms. */
  duration: number;
};

/** Stats for witness generation. */
export type CircuitWitnessGenerationStats = {
  /** name of the event. */
  eventName: 'circuit-witness-generation';
  /** Name of the circuit. */
  circuitName: CircuitName;
  /** Optional. The function name that's being proven */
  appCircuitName?: string;
  /** Duration in ms. */
  duration: number;
  /** Size in bytes of circuit inputs. */
  inputSize: number;
  /** Size in bytes of circuit outputs (aka public inputs). */
  outputSize: number;
};

/** Stats for proving a circuit */
export type CircuitProvingStats = {
  /** Name of the event. */
  eventName: 'circuit-proving';
  /** Name of the circuit. */
  circuitName: CircuitName;
  /** Optional. The function name that was proven */
  appCircuitName?: string;
  /** Duration in ms. */
  duration: number;
  /** The size of the circuit (in gates) */
  circuitSize: number;
  /** Size in bytes of circuit inputs. */
  inputSize: number;
  /** Size in bytes of the proof. */
  proofSize: number;
  /** The number of public inputs */
  numPublicInputs: number;
};

/** Stats for verifying a circuit */
export type CircuitVerificationStats = {
  /** Name of the event. */
  eventName: 'circuit-verification';
  /** Name of the circuit. */
  circuitName: CircuitName;
  /** Type of proof (client-ivc, honk, etc) */
  proofType: 'client-ivc' | 'ultra-honk';
  /** Duration in ms. */
  duration: number;
};

/** Stats for an L2 block built by a sequencer. */
export type L2BlockBuiltStats = {
  /** The creator of the block */
  creator: string;
  /** Name of the event. */
  eventName: 'l2-block-built';
  /** Total duration in ms. */
  duration: number;
  /** Time for processing public txs in ms. */
  publicProcessDuration: number;
  /** Time for running rollup circuits in ms.  */
  rollupCircuitsDuration: number;
} & L2BlockStats;

/** Stats for an L2 block processed by the world state synchronizer. */
export type L2BlockHandledStats = {
  /** Name of the event. */
  eventName: 'l2-block-handled';
  /** Total duration in ms. */
  duration: number;
  /** Pending block number. */
  unfinalisedBlockNumber: bigint;
  /** Proven block number. */
  finalisedBlockNumber: bigint;
  /** Oldest historic block number. */
  oldestHistoricBlock: bigint;
} & L2BlockStats;

/** Stats for a tx. */
export type TxStats = {
  /** Hash of the tx. */
  txHash: string;
  /** Total size in bytes. */
  size: number;
  /** Size of the proof. */
  proofSize: number;
  /** Number of unencrypted logs. */
  unencryptedLogCount: number;
  /** Serialized size of unencrypted logs. */
  unencryptedLogSize: number;
  /** Number of note hashes */
  noteHashCount: number;
  /** Number of nullifiers */
  nullifierCount: number;
  /** Number of private logs */
  privateLogCount: number;
  /** How many classes were registered through the canonical class registerer. */
  classRegisteredCount: number;
  /** Serialized size of contract class logs. */
  contractClassLogSize: number;
  /** How this tx pays for its fee */
  feePaymentMethod: 'none' | 'fee_juice' | 'fpc_public' | 'fpc_private';
};

/**
 * Stats for tree insertions
 */
export type TreeInsertionStats = {
  /** Name of the event. */
  eventName: 'tree-insertion';
  /** Duration in ms. */
  duration: number;
  /** The size of the insertion batch */
  batchSize: number;
  /** The tree name */
  treeName: string;
  /** The tree depth */
  treeDepth: number;
  /** Tree type */
  treeType: 'append-only' | 'indexed';
  /** Number of hashes performed */
  hashCount: number;
  /** Average duration of a hash operation */
  hashDuration: number;
};

/** A new tx was added to the tx pool. */
export type TxAddedToPoolStats = {
  /** Name of the event. */
  eventName: 'tx-added-to-pool';
} & TxStats;

/** Stats emitted in structured logs with an `eventName` for tracking. */
export type Stats =
  | AvmSimulationStats
  | CircuitProvingStats
  | CircuitSimulationStats
  | CircuitWitnessGenerationStats
  | PublicDBAccessStats
  | L1PublishBlockStats
  | L1PublishProofStats
  | L2BlockBuiltStats
  | L2BlockHandledStats
  | NodeSyncedChainHistoryStats
  | ProofConstructed
  | TreeInsertionStats
  | TxAddedToPoolStats;

/** Set of event names across emitted stats. */
export type StatsEventName = Stats['eventName'];
