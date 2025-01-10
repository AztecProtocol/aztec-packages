import { createLogger } from '@aztec/foundation/log';
import { LazyArtifactProvider } from '@aztec/noir-protocol-circuits-types/client/lazy';

import { BBWASMPrivateKernelProver } from './bb_wasm_private_kernel_prover.js';

export class BBWASMLazyPrivateKernelProver extends BBWASMPrivateKernelProver {
  constructor(threads = 1, log = createLogger('bb-prover:wasm:lazy')) {
    super(new LazyArtifactProvider(), threads, log);
  }
}
