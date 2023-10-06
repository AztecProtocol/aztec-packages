// Rollup sizes to track (duplicated from yarn-project/end-to-end/src/benchmarks/bench_publish_rollup.test.ts)
const ROLLUP_SIZES = process.env.ROLLUP_SIZES
  ? process.env.ROLLUP_SIZES.split(",").map(Number)
  : [8, 32, 128];

// Output files
const BENCHMARK_FILE_JSON = process.env.BENCHMARK_FILE_JSON ?? "benchmark.json";

module.exports = {
  // Metrics to capture
  L1_ROLLUP_CALLDATA_SIZE_IN_BYTES: "l1_rollup_calldata_size_in_bytes",
  L1_ROLLUP_CALLDATA_GAS: "l1_rollup_calldata_gas",
  L1_ROLLUP_EXECUTION_GAS: "l1_rollup_execution_gas",
  L2_BLOCK_PROCESSING_TIME: "l2_block_processing_time_in_ms",
  CIRCUIT_SIMULATION_TIME: "circuit_simulation_time_in_ms",
  CIRCUIT_INPUT_SIZE: "circuit_input_size_in_bytes",
  CIRCUIT_OUTPUT_SIZE: "circuit_output_size_in_bytes",
  NOTE_SUCCESSFUL_DECRYPTING_TIME: "note_successful_decrypting_time_in_ms",
  NOTE_TRIAL_DECRYPTING_TIME: "note_unsuccessful_decrypting_time_in_ms",
  L2_BLOCK_BUILD_TIME: "l2_block_building_time_in_ms",
  L2_BLOCK_ROLLUP_SIMULATION_TIME: "l2_block_rollup_simulation_time_in_ms",
  L2_BLOCK_PUBLIC_TX_PROCESS_TIME: "l2_block_public_tx_process_time_in_ms",
  // Events to track
  L2_BLOCK_PUBLISHED_TO_L1: "rollup-published-to-l1",
  L2_BLOCK_SYNCED: "l2-block-handled",
  L2_BLOCK_BUILT: "l2-block-built",
  CIRCUIT_SIMULATED: "circuit-simulation",
  NOTE_PROCESSOR_CAUGHT_UP: "note-processor-caught-up",
  // Other
  ROLLUP_SIZES,
  BENCHMARK_FILE_JSON,
};
