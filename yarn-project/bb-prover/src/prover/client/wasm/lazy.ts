import { createLogger } from '@aztec/foundation/log';
import { LazyArtifactProvider } from '@aztec/noir-protocol-circuits-types/client/lazy';
import type { CircuitSimulator } from '@aztec/simulator/client';

import { BBWASMPrivateKernelProver } from './bb_wasm_private_kernel_prover.js';

export class BBWASMLazyPrivateKernelProver extends BBWASMPrivateKernelProver {
  constructor(simulator: CircuitSimulator, threads = 16, log = createLogger('bb-prover:wasm:lazy')) {
    super(new LazyArtifactProvider(), simulator, threads, log);
  }
}
