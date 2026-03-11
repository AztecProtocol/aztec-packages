import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * Controls which accounts' private state and keys are accessible during execution.
 * - `'ALL_SCOPES'`: All registered accounts' private state and keys are accessible.
 * - `AztecAddress[]` with entries: Only the specified accounts' private state and keys are accessible.
 * - `[]` (empty array): Deny-all. No private state is visible and no keys are accessible.
 */
export type AccessScopes = 'ALL_SCOPES' | AztecAddress[];
