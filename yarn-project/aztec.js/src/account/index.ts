/**
 * The `account` module provides utilities for managing accounts. The {@link AccountManager} class
 * allows to deploy and register a fresh account, or to obtain a `Wallet` instance out of an account
 * already deployed. Use the `@aztec/accounts` package to load default account implementations that rely
 * on ECDSA or Schnorr signatures.
 *
 * @packageDocumentation
 */
import { Fr } from '@aztec/circuits.js';

export { AccountContract } from './contract.js';
export { AccountInterface, AuthWitnessProvider, EntrypointInterface, FeeOptions } from './interface.js';
export * from './wallet.js';

/** A contract deployment salt. */
export type Salt = Fr | number | bigint;
