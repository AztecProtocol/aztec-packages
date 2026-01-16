import type { BBPrivateKernelProverOptions } from '@aztec/bb-prover/client';
import type { Logger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { CircuitSimulator } from '@aztec/simulator/client';
import type { PrivateKernelProver } from '@aztec/stdlib/interfaces/client';

export type PXECreationOptions = {
  loggers?: { store?: Logger; pxe?: Logger; prover?: Logger };
  useLogSuffix?: boolean | string;
  proverOrOptions?: PrivateKernelProver | BBPrivateKernelProverOptions;
  store?: AztecAsyncKVStore;
  simulator?: CircuitSimulator;
};
