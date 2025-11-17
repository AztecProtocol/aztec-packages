import { createLogger } from '@aztec/foundation/log';
import { LazyArtifactProvider } from '@aztec/noir-protocol-circuits-types/client/lazy';
import type { CircuitSimulator } from '@aztec/simulator/client';

import { BBPrivateKernelProver } from './bb_private_kernel_prover.js';

export class BBLazyPrivateKernelProver extends BBPrivateKernelProver {
  constructor(simulator: CircuitSimulator, log = createLogger('bb-prover:lazy')) {
    super(new LazyArtifactProvider(), simulator, log);
  }
}
