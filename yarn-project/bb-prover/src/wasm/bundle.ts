import { createLogger } from '@aztec/foundation/log';
import { BundleArtifactProvider } from '@aztec/noir-protocol-circuits-types/client/bundle';
import type { SimulationProvider } from '@aztec/simulator/client';

import { BBWASMPrivateKernelProver } from './bb_wasm_private_kernel_prover.js';

export class BBWASMBundlePrivateKernelProver extends BBWASMPrivateKernelProver {
  constructor(simulationProvider: SimulationProvider, threads = 1, log = createLogger('bb-prover:wasm:bundle')) {
    super(new BundleArtifactProvider(), simulationProvider, threads, log);
  }
}
