/** How a metric is grouped in benchmarks: by block size, by length of chain processed, or by circuit name. */
export type MetricGroupBy = 'block-size' | 'chain-length' | 'circuit-name';

/** Definition of a metric to track in benchmarks. */
export interface Metric {
  /** Identifier. */
  name: string;
  /** What dimension this metric is grouped by. */
  groupBy: MetricGroupBy;
}

/** Metric definitions to track from benchmarks. */
export const Metrics = [
  { name: 'l1_rollup_calldata_size_in_bytes', groupBy: 'block-size' },
  { name: 'l1_rollup_calldata_gas', groupBy: 'block-size' },
  { name: 'l1_rollup_execution_gas', groupBy: 'block-size' },
  { name: 'l2_block_processing_time_in_ms', groupBy: 'block-size' },
  { name: 'note_successful_decrypting_time_in_ms', groupBy: 'block-size' },
  { name: 'note_trial_decrypting_time_in_ms', groupBy: 'block-size' },
  { name: 'l2_block_building_time_in_ms', groupBy: 'block-size' },
  { name: 'l2_block_rollup_simulation_time_in_ms', groupBy: 'block-size' },
  { name: 'l2_block_public_tx_process_time_in_ms', groupBy: 'block-size' },
  { name: 'node_history_sync_time_in_ms', groupBy: 'chain-length' },
  { name: 'note_history_successful_decrypting_time_in_ms', groupBy: 'chain-length' },
  { name: 'note_history_trial_decrypting_time_in_ms', groupBy: 'chain-length' },
  { name: 'node_database_size_in_bytes', groupBy: 'chain-length' },
  { name: 'pxe_database_size_in_bytes', groupBy: 'chain-length' },
  { name: 'circuit_simulation_time_in_ms', groupBy: 'circuit-name' },
  { name: 'circuit_input_size_in_bytes', groupBy: 'circuit-name' },
  { name: 'circuit_output_size_in_bytes', groupBy: 'circuit-name' },
] as const satisfies readonly Metric[];

/** Metric definitions to track from benchmarks. */
export type Metrics = typeof Metrics;

/** Type of valid metric names. */
export type MetricName = Metrics[number]['name'];
