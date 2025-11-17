import { createLogger } from '@aztec/foundation/log';
import { BundleArtifactProvider } from '@aztec/noir-protocol-circuits-types/client/bundle';
import type { CircuitSimulator } from '@aztec/simulator/client';

import { BBPrivateKernelProver } from './bb_private_kernel_prover.js';

export class BBBundlePrivateKernelProver extends BBPrivateKernelProver {
  constructor(simulator: CircuitSimulator, log = createLogger('bb-prover:bundle')) {
    super(new BundleArtifactProvider(), simulator, log);
  }
}
