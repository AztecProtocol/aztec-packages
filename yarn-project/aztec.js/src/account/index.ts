/**
 * The `account` module provides utilities for managing accounts.
 *
 * @packageDocumentation
 */
import type { Fr } from '@aztec/foundation/curves/bn254';

export { type AccountContract, getAccountContractAddress } from './account_contract.js';
export { type Account, BaseAccount, type AuthorizationProvider } from './account.js';
export { AccountWithSecretKey } from './account_with_secret_key.js';

/** A contract deployment salt. */
export type Salt = Fr | number | bigint;
