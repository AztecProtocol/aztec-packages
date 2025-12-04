import type { Logger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { CircuitSimulator } from '@aztec/simulator';
import type { PrivateKernelProver } from '@aztec/stdlib/interfaces/client';

export type PXECreationOptions = {
  loggers?: { store?: Logger; pxe?: Logger; prover?: Logger };
  useLogSuffix?: boolean | string;
  prover?: PrivateKernelProver;
  store?: AztecAsyncKVStore;
  simulator?: CircuitSimulator;
};
