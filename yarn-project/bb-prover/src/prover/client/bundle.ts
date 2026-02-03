import { BundleArtifactProvider } from '@aztec/noir-protocol-circuits-types/client/bundle';
import type { CircuitSimulator } from '@aztec/simulator/client';

import { BBPrivateKernelProver, type BBPrivateKernelProverOptions } from './bb_private_kernel_prover.js';

export class BBBundlePrivateKernelProver extends BBPrivateKernelProver {
  constructor(simulator: CircuitSimulator, options: BBPrivateKernelProverOptions = {}) {
    super(new BundleArtifactProvider(), simulator, options);
  }
}
