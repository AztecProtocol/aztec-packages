import type { BBPrivateKernelProverOptions } from '@aztec/bb-prover/client';
import type { Logger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { CircuitSimulator } from '@aztec/simulator/client';
import type { PrivateKernelProver } from '@aztec/stdlib/interfaces/client';

import type { ExecutionHooks } from '../hooks/index.js';
import type { PreloadedContractsProvider } from '../pxe.js';

export type PXECreationOptions = {
  loggers?: { store?: Logger; pxe?: Logger; prover?: Logger };
  /** Actor label to include in log output (e.g., 'pxe-0', 'pxe-test'). */
  loggerActorLabel?: string;
  proverOrOptions?: PrivateKernelProver | BBPrivateKernelProverOptions;
  store?: AztecAsyncKVStore;
  simulator?: CircuitSimulator;
  /** Optional hooks to observe and influence contract execution. */
  hooks?: ExecutionHooks;
  /** Contracts to preload; used directly in place of the PXE's default (the standard multi-call entrypoint). */
  preloadedContractsProvider?: PreloadedContractsProvider;
};

/** Checks if the given value implements the PrivateKernelProver interface via duck-typing. */
export function isPrivateKernelProver(value: unknown): value is PrivateKernelProver {
  return (
    typeof value === 'object' && value !== null && typeof (value as PrivateKernelProver).createChonkProof === 'function'
  );
}
