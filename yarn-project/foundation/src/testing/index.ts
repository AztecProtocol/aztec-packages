export * from './snapshot_serializer.js';
export * from './port_allocator.js';

/** Returns whether test data generation is enabled */
export function isGenerateTestDataEnabled() {
  return ['1', 'true'].includes(process.env.AZTEC_GENERATE_TEST_DATA ?? '') && typeof expect !== 'undefined';
}
