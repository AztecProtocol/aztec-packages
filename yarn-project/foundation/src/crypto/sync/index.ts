import { BarretenbergSync } from '@aztec/bb.js';

export * from './poseidon/index.js';
export * from './pedersen/index.js';

await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
