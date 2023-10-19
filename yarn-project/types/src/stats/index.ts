export * from './stats.js';
export * from './metrics.js';
export * from './benchmarks.js';

/** Block sizes to use for benchmark tests on multiple block sizes. */
export const BENCHMARK_BLOCK_SIZES = process.env.BENCHMARK_BLOCK_SIZES
  ? process.env.BENCHMARK_BLOCK_SIZES.split(',').map(Number)
  : [8, 32, 128];

/** Block size to use for building chains of multiple blocks. */
export const BENCHMARK_HISTORY_BLOCK_SIZE = process.env.BENCHMARK_HISTORY_BLOCK_SIZE
  ? +process.env.BENCHMARK_HISTORY_BLOCK_SIZE
  : 16;

/** Chain lengths to test for history processing benchmarks. */
export const BENCHMARK_HISTORY_CHAIN_LENGTHS = process.env.BENCHMARK_HISTORY_CHAIN_LENGTHS
  ? process.env.BENCHMARK_HISTORY_CHAIN_LENGTHS.split(',').map(Number)
  : [5, 10];
