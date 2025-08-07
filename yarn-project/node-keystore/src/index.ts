/**
 * Keystore Configuration Module
 *
 * Provides types, validation, and loading functionality for validator keystore files.
 */

// Types
export * from './types.js';

// Validation
export * from './validation.js';

// Loading
export * from './loader.js';

// Re-export commonly used types for convenience
export type {
  KeyStore,
  ValidatorKeyStore,
  ProverKeyStore,
  EthAccounts,
  EthAccount,
  ResolvedKeyStore,
  ResolvedValidatorConfig,
  ResolvedProverConfig,
  ResolvedAccount,
} from './types.js';
