import { BarretenbergSync } from '@aztec/bb.js';

export * from './structs/index.js';
export * from './utils/jsUtils.js';
export * from './contract/index.js';
export * from './types/index.js';
export * from './constants.gen.js';

/**
 * Should be called at an appropriate time to initialize underlying bb.js library.
 * If running in a test environment, we'll do this on import of circuits.js for convenience.
 */
export async function initCircuitsJs() {
  await BarretenbergSync.initSingleton();
}

if (process.env.NODE_ENV === 'test') {
  await initCircuitsJs();
}
