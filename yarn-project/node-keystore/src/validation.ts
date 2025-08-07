/**
 * Keystore Configuration Validation
 *
 * Provides JSON schema validation and runtime type checking for keystore files.
 */
import type {
  EthAccount,
  EthAccounts,
  EthMnemonicConfig,
  KeyStore,
  ProverKeyStore,
  ValidatorKeyStore,
} from './types.js';

/**
 * Validation error details
 */
export class KeyStoreValidationError extends Error {
  constructor(
    message: string,
    public path: string,
    public value?: unknown,
  ) {
    super(`Keystore validation error at ${path}: ${message}`);
    this.name = 'KeyStoreValidationError';
  }
}

/**
 * Validates if a string is a valid hex-encoded private key (32 bytes = 64 hex chars + 0x prefix)
 */
export function isValidPrivateKey(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Validates if a string is a valid Ethereum address (20 bytes = 40 hex chars + 0x prefix)
 */
export function isValidEthAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Validates if a string is a valid Aztec address (32 bytes = 64 hex chars + 0x prefix)
 */
export function isValidAztecAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Validates if a string is a valid URL
 */
export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates if a value is a valid mnemonic configuration
 */
export function isValidMnemonicConfig(value: unknown): value is EthMnemonicConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const config = value as Record<string, unknown>;

  // Must have mnemonic
  if (typeof config.mnemonic !== 'string' || !config.mnemonic.trim()) {
    return false;
  }

  // Optional fields must be numbers if present
  const optionalNumberFields = ['addressIndex', 'accountIndex', 'addressCount', 'accountCount'];
  for (const field of optionalNumberFields) {
    if (config[field] !== undefined && (!Number.isInteger(config[field]) || (config[field] as number) < 0)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates if a value is a valid EthAccount
 */
export function isValidEthAccount(value: unknown, path: string): boolean {
  if (typeof value === 'string') {
    // Could be private key or address for remote signer
    return isValidPrivateKey(value) || isValidEthAddress(value);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  const account = value as Record<string, unknown>;

  // Check for JSON v3 keystore format
  if ('path' in account) {
    if (typeof account.path !== 'string') {
      throw new KeyStoreValidationError('path must be a string', `${path}.path`);
    }
    if (account.password !== undefined && typeof account.password !== 'string') {
      throw new KeyStoreValidationError('password must be a string if provided', `${path}.password`);
    }
    return true;
  }

  // Check for remote signer format
  if ('address' in account) {
    if (!isValidEthAddress(account.address as string)) {
      throw new KeyStoreValidationError('address must be a valid Ethereum address', `${path}.address`);
    }

    if (account.remoteSignerUrl !== undefined && !isValidUrl(account.remoteSignerUrl as string)) {
      throw new KeyStoreValidationError('remoteSignerUrl must be a valid URL', `${path}.remoteSignerUrl`);
    }

    if (account.certPath !== undefined && typeof account.certPath !== 'string') {
      throw new KeyStoreValidationError('certPath must be a string if provided', `${path}.certPath`);
    }

    if (account.certPass !== undefined && typeof account.certPass !== 'string') {
      throw new KeyStoreValidationError('certPass must be a string if provided', `${path}.certPass`);
    }

    return true;
  }

  return false;
}

/**
 * Validates if a value is valid EthAccounts (single, array, or mnemonic)
 */
export function validateEthAccounts(value: unknown, path: string): void {
  if (isValidMnemonicConfig(value)) {
    return; // Valid mnemonic config
  }

  if (Array.isArray(value)) {
    value.forEach((account, index) => {
      if (!isValidEthAccount(account, `${path}[${index}]`)) {
        throw new KeyStoreValidationError('invalid account configuration', `${path}[${index}]`);
      }
    });
    return;
  }

  if (!isValidEthAccount(value, path)) {
    throw new KeyStoreValidationError('invalid account configuration', path);
  }
}

/**
 * Validates a ValidatorKeyStore configuration
 */
export function validateValidatorKeyStore(validator: unknown, index: number): void {
  if (!validator || typeof validator !== 'object') {
    throw new KeyStoreValidationError('validator must be an object', `validators[${index}]`);
  }

  const config = validator as Record<string, unknown>;
  const basePath = `validators[${index}]`;

  // Required: attester
  if (!config.attester) {
    throw new KeyStoreValidationError('attester is required', `${basePath}.attester`);
  }
  validateEthAccounts(config.attester, `${basePath}.attester`);

  // Required: feeRecipient
  if (!config.feeRecipient) {
    throw new KeyStoreValidationError('feeRecipient is required', `${basePath}.feeRecipient`);
  }
  if (!isValidAztecAddress(config.feeRecipient as string)) {
    throw new KeyStoreValidationError('feeRecipient must be a valid Aztec address', `${basePath}.feeRecipient`);
  }

  // Optional: coinbase
  if (config.coinbase !== undefined && !isValidEthAddress(config.coinbase as string)) {
    throw new KeyStoreValidationError('coinbase must be a valid Ethereum address', `${basePath}.coinbase`);
  }

  // Optional: publisher
  if (config.publisher !== undefined) {
    validateEthAccounts(config.publisher, `${basePath}.publisher`);
  }

  // Optional: remoteSigner
  if (config.remoteSigner !== undefined) {
    validateRemoteSignerConfig(config.remoteSigner, `${basePath}.remoteSigner`);
  }
}

/**
 * Validates a ProverKeyStore configuration
 */
export function validateProverKeyStore(prover: unknown): void {
  if (!prover) {
    throw new KeyStoreValidationError('prover cannot be null', 'prover');
  }

  // If it's a single EthAccount
  if (typeof prover === 'string' || (typeof prover === 'object' && ('path' in prover || 'address' in prover))) {
    if (!isValidEthAccount(prover, 'prover')) {
      throw new KeyStoreValidationError('invalid prover account configuration', 'prover');
    }
    return;
  }

  // Otherwise it should be a prover config object
  if (typeof prover !== 'object') {
    throw new KeyStoreValidationError('prover must be an object or account', 'prover');
  }

  const config = prover as Record<string, unknown>;

  // Required: id
  if (!config.id || !isValidEthAddress(config.id as string)) {
    throw new KeyStoreValidationError('prover.id must be a valid Ethereum address', 'prover.id');
  }

  // Required: publisher
  if (!config.publisher) {
    throw new KeyStoreValidationError('prover.publisher is required', 'prover.publisher');
  }
  validateEthAccounts(config.publisher, 'prover.publisher');
}

/**
 * Validates a remote signer configuration
 */
export function validateRemoteSignerConfig(config: unknown, path: string): void {
  if (typeof config === 'string') {
    if (!isValidUrl(config)) {
      throw new KeyStoreValidationError('remote signer URL must be valid', path);
    }
    return;
  }

  if (!config || typeof config !== 'object') {
    throw new KeyStoreValidationError('remote signer config must be a string URL or object', path);
  }

  const signerConfig = config as Record<string, unknown>;

  if (!signerConfig.remoteSignerUrl || !isValidUrl(signerConfig.remoteSignerUrl as string)) {
    throw new KeyStoreValidationError('remoteSignerUrl must be a valid URL', `${path}.remoteSignerUrl`);
  }

  if (signerConfig.certPath !== undefined && typeof signerConfig.certPath !== 'string') {
    throw new KeyStoreValidationError('certPath must be a string if provided', `${path}.certPath`);
  }

  if (signerConfig.certPass !== undefined && typeof signerConfig.certPass !== 'string') {
    throw new KeyStoreValidationError('certPass must be a string if provided', `${path}.certPass`);
  }
}

/**
 * Validates a complete KeyStore configuration
 */
export function validateKeyStore(keystore: unknown): asserts keystore is KeyStore {
  if (!keystore || typeof keystore !== 'object') {
    throw new KeyStoreValidationError('keystore must be an object', 'root');
  }

  const config = keystore as Record<string, unknown>;

  // Required: schemaVersion
  if (!Number.isInteger(config.schemaVersion) || config.schemaVersion !== 1) {
    throw new KeyStoreValidationError('schemaVersion must be 1', 'schemaVersion');
  }

  // Optional: validators
  if (config.validators !== undefined) {
    if (!Array.isArray(config.validators)) {
      throw new KeyStoreValidationError('validators must be an array', 'validators');
    }
    config.validators.forEach((validator, index) => {
      validateValidatorKeyStore(validator, index);
    });
  }

  // Optional: slasher
  if (config.slasher !== undefined) {
    validateEthAccounts(config.slasher, 'slasher');
  }

  // Optional: remoteSigner
  if (config.remoteSigner !== undefined) {
    validateRemoteSignerConfig(config.remoteSigner, 'remoteSigner');
  }

  // Optional: prover
  if (config.prover !== undefined) {
    validateProverKeyStore(config.prover);
  }

  // Must have at least one of validators or prover
  if (!config.validators && !config.prover) {
    throw new KeyStoreValidationError('keystore must have at least validators or prover configuration', 'root');
  }
}

/**
 * Validates a keystore and returns detailed validation results
 */
export function validateKeyStoreWithDetails(keystore: unknown): {
  isValid: boolean;
  errors: KeyStoreValidationError[];
} {
  const errors: KeyStoreValidationError[] = [];

  try {
    validateKeyStore(keystore);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof KeyStoreValidationError) {
      errors.push(error);
    } else {
      errors.push(new KeyStoreValidationError(`Unexpected validation error: ${error}`, 'root'));
    }
    return { isValid: false, errors };
  }
}
