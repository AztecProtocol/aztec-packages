import { Barretenberg } from '@aztec/bb.js';

export * from './poseidon/index.js';
export * from './pedersen/index.js';

await Barretenberg.initSingleton();
