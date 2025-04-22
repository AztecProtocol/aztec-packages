import type { Logger } from '@aztec/foundation/log';
import type { PrivateKernelProver } from '@aztec/stdlib/interfaces/client';

export type PXECreationOptions = {
  loggers: { store?: Logger; pxe?: Logger; prover?: Logger };
  prover?: PrivateKernelProver;
};
