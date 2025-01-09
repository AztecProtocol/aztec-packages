import { createLogger } from '@aztec/foundation/log';
import { BundleArtifactProvider } from '@aztec/noir-protocol-circuits-types/client/bundle';

import { BBWASMPrivateKernelProver } from './bb_wasm_private_kernel_prover.js';

export class BBWASMBundlePrivateKernelProver extends BBWASMPrivateKernelProver {
  constructor(threads = 1, log = createLogger('bb-prover:wasm:bundle')) {
    super(new BundleArtifactProvider(), threads, log);
  }
}
