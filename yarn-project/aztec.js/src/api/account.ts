/**
 * Re-exports of account-related types and classes for managing Aztec accounts.
 *
 * This module provides access to account contracts, account interfaces, and various
 * account implementations including signerless accounts and accounts with secret keys.
 *
 * @module api/account
 */

export { type AccountContract, type AccountInterface, type Salt, getAccountContractAddress } from '../account/index.js';
export type { AuthWitnessProvider, ChainInfo } from '@aztec/entrypoints/interfaces';

export { AccountWithSecretKey } from '../account/account_with_secret_key.js';
export { type Account, BaseAccount } from '../account/account.js';
export { SignerlessAccount } from '../account/signerless_account.js';