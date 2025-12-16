/**
 * The `account` module provides utilities for managing accounts.
 *
 * @packageDocumentation
 */
import type { Fr } from '@aztec/foundation/fields';

export { type AccountContract, getAccountContractAddress } from './account_contract.js';
export { type AccountInterface } from './interface.js';

/** A contract deployment salt. */
export type Salt = Fr | number | bigint;
