import { LazyArtifactProvider } from '@aztec/noir-protocol-circuits-types/client/lazy';
import type { CircuitSimulator } from '@aztec/simulator/client';

import { BBPrivateKernelProver, type BBPrivateKernelProverOptions } from './bb_private_kernel_prover.js';

export class BBLazyPrivateKernelProver extends BBPrivateKernelProver {
  constructor(simulator: CircuitSimulator, options: BBPrivateKernelProverOptions = {}) {
    super(new LazyArtifactProvider(), simulator, options);
  }
}
