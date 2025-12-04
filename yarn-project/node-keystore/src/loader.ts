/**
 * Keystore File Loader
 *
 * Handles loading and parsing keystore configuration files.
 */
import { SecretValue } from '@aztec/foundation/config';
import { createLogger } from '@aztec/foundation/log';

import { readFileSync, readdirSync, statSync } from 'fs';
import { extname, join } from 'path';

import { keystoreSchema } from './schemas.js';
import type { EthAccounts, KeyStore } from './types.js';

const logger = createLogger('node-keystore:loader');

/**
 * Error thrown when keystore loading fails
 */
export class KeyStoreLoadError extends Error {
  constructor(
    message: string,
    public filePath: string,
    public override cause?: Error,
  ) {
    super(`Failed to load keystore from ${filePath}: ${message}`);
    this.name = 'KeyStoreLoadError';
  }
}

/**
 * Loads and validates a single keystore JSON file.
 *
 * @param filePath Absolute or relative path to a keystore JSON file.
 * @returns Parsed keystore object adhering to the schema.
 * @throws KeyStoreLoadError When JSON is invalid, schema validation fails, or other IO/parse errors occur.
 */
export function loadKeystoreFile(filePath: string): KeyStore {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Parse JSON and validate with Zod schema (following Aztec patterns)
    const result = keystoreSchema.parse(JSON.parse(content));
    return result;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new KeyStoreLoadError('Invalid JSON format', filePath, error);
    }
    if (error && typeof error === 'object' && 'issues' in error) {
      const issues = (error as any).issues ?? [];
      const message =
        issues
          .map((e: any) => {
            const path = Array.isArray(e.path) ? e.path.join('.') : String(e.path ?? 'root');
            return `${e.message} (${path})`;
          })
          .join('. ') || 'Schema validation error';
      throw new KeyStoreLoadError(`Schema validation failed: ${message}`, filePath, error as unknown as Error);
    }
    throw new KeyStoreLoadError(`Unexpected error: ${String(error)}`, filePath, error as Error);
  }
}

/**
 * Loads keystore files from a directory (only .json files).
 *
 * @param dirPath Absolute or relative path to a directory containing keystore files.
 * @returns Array of parsed keystores loaded from all .json files in the directory.
 * @throws KeyStoreLoadError When the directory can't be read or contains no valid keystore files.
 */
export function loadKeystoreDirectory(dirPath: string): KeyStore[] {
  try {
    const files = readdirSync(dirPath);
    const keystores: KeyStore[] = [];

    for (const file of files) {
      // Only process .json files
      if (extname(file).toLowerCase() !== '.json') {
        continue;
      }

      const filePath = join(dirPath, file);
      try {
        const keystore = loadKeystoreFile(filePath);
        keystores.push(keystore);
      } catch (error) {
        // Re-throw with directory context
        if (error instanceof KeyStoreLoadError) {
          throw error;
        }
        throw new KeyStoreLoadError(`Failed to load file ${file}`, filePath, error as Error);
      }
    }

    if (keystores.length === 0) {
      throw new KeyStoreLoadError('No valid keystore files found', dirPath);
    }

    return keystores;
  } catch (error) {
    if (error instanceof KeyStoreLoadError) {
      throw error;
    }
    throw new KeyStoreLoadError(`Failed to read directory`, dirPath, error as Error);
  }
}

/**
 * Loads keystore(s) from a path (file or directory).
 *
 * If a file is provided, loads a single keystore. If a directory is provided,
 * loads all keystore files within that directory.
 *
 * @param path File or directory path.
 * @returns Array of parsed keystores.
 * @throws KeyStoreLoadError When the path is invalid or cannot be accessed.
 */
export function loadKeystores(path: string): KeyStore[] {
  try {
    const stats = statSync(path);

    if (stats.isFile()) {
      return [loadKeystoreFile(path)];
    } else if (stats.isDirectory()) {
      return loadKeystoreDirectory(path);
    } else {
      throw new KeyStoreLoadError('Path is neither a file nor directory', path);
    }
  } catch (error) {
    if (error instanceof KeyStoreLoadError) {
      throw error;
    }

    const err = error as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      throw new KeyStoreLoadError('File or directory not found', path, error as Error);
    }

    throw new KeyStoreLoadError(`Failed to access path: ${err?.code ?? 'UNKNOWN'}`, path, error as Error);
  }
}

/**
 * Loads keystore(s) from multiple paths (comma-separated string or array).
 *
 * @param paths Comma-separated string or array of file/directory paths.
 * @returns Flattened array of all parsed keystores from all paths.
 * @throws KeyStoreLoadError When any path fails to load; includes context for which path list was used.
 */
export function loadMultipleKeystores(paths: string | string[]): KeyStore[] {
  const pathArray = typeof paths === 'string' ? paths.split(',').map(p => p.trim()) : paths;
  const allKeystores: KeyStore[] = [];

  for (const path of pathArray) {
    if (!path) {
      continue;
    } // Skip empty paths

    try {
      const keystores = loadKeystores(path);
      allKeystores.push(...keystores);
    } catch (error) {
      // Add context about which path failed
      if (error instanceof KeyStoreLoadError) {
        throw new KeyStoreLoadError(
          `${error.message} (from path list: ${pathArray.join(', ')})`,
          error.filePath,
          error.cause,
        );
      }
      throw error;
    }
  }

  if (allKeystores.length === 0) {
    throw new KeyStoreLoadError('No keystore files found in any of the provided paths', pathArray.join(', '));
  }

  return allKeystores;
}

/**
 * Merges multiple keystores into a single configuration.
 *
 * - Concatenates validator arrays and enforces unique attester addresses by simple structural keys
 * - Accumulates all slasher accounts across inputs
 * - Applies last-one-wins semantics for file-level remote signer defaults
 * - Requires at most one prover configuration across inputs
 *
 * Note: Full duplicate detection (e.g., after resolving JSON V3 or mnemonics) is
 * performed downstream by the validator client.
 *
 * @param keystores Array of keystores to merge.
 * @returns A merged keystore object.
 * @throws Error When keystore list is empty.
 * @throws KeyStoreLoadError When duplicate attester keys are found or multiple prover configs exist.
 */
export function mergeKeystores(keystores: KeyStore[]): KeyStore {
  if (keystores.length === 0) {
    throw new Error('Cannot merge empty keystore list');
  }

  if (keystores.length === 1) {
    return keystores[0];
  }

  // Track attester addresses to prevent duplicates
  const attesterAddresses = new Set<string>();

  const merged: KeyStore = {
    schemaVersion: 1,
    validators: [],
    slasher: undefined,
    remoteSigner: undefined,
    prover: undefined,
  };

  for (let i = 0; i < keystores.length; i++) {
    const keystore = keystores[i];

    // Merge validators
    if (keystore.validators) {
      for (const validator of keystore.validators) {
        // Check for duplicate attester addresses
        const attesterKeys = extractAttesterKeys(validator.attester);
        for (const key of attesterKeys) {
          const keyString = key instanceof SecretValue ? (key.getValue() as string) : key;
          if (attesterAddresses.has(keyString)) {
            const displayKey = redactAttesterKeyForDisplay(key, validator.attester);
            throw new KeyStoreLoadError(
              `Duplicate attester account ${displayKey} found across keystore files`,
              `keystores[${i}].validators`,
            );
          }
          if (key instanceof SecretValue) {
            attesterAddresses.add(key.getValue() as string);
          } else {
            attesterAddresses.add(key);
          }
        }
      }
      merged.validators!.push(...keystore.validators);
    }

    // Merge slasher (accumulate all)
    if (keystore.slasher) {
      if (!merged.slasher) {
        merged.slasher = keystore.slasher;
      } else {
        const toArray = (accounts: EthAccounts): unknown[] => (Array.isArray(accounts) ? accounts : [accounts]);
        const combined = [...toArray(merged.slasher), ...toArray(keystore.slasher)];
        // Cast is safe at runtime: consumer handles arrays with mixed account configs
        merged.slasher = combined as unknown as EthAccounts;
      }
    }

    // Merge remote signer (last one wins, but warn about conflicts)
    if (keystore.remoteSigner) {
      if (merged.remoteSigner) {
        logger.warn('Multiple default remote signer configurations found, using the last one');
      }
      merged.remoteSigner = keystore.remoteSigner;
    }

    // Merge prover (error if multiple)
    if (keystore.prover) {
      if (merged.prover) {
        throw new KeyStoreLoadError(
          'Multiple prover configurations found across keystore files. Only one prover configuration is allowed.',
          `keystores[${i}].prover`,
        );
      }
      merged.prover = keystore.prover;
    }
  }

  // Clean up empty arrays
  if (merged.validators!.length === 0) {
    delete merged.validators;
  }

  return merged;
}

/**
 * Extracts attester addresses/keys for coarse duplicate checking during merge.
 *
 * This avoids expensive resolution/decryption and is intended as a best-effort
 * guard only. Full duplicate detection is done in the validator client after
 * accounts are fully resolved.
 *
 * @param attester The attester configuration in any supported shape.
 * @returns Array of string keys used to detect duplicates.
 */
function extractAttesterKeys(attester: unknown): (string | SecretValue<string>)[] {
  // String forms (private key or other) - return as-is for coarse uniqueness
  if (typeof attester === 'string' || attester instanceof SecretValue) {
    return [attester];
  }

  // Arrays of attester items
  if (Array.isArray(attester)) {
    const keys: (string | SecretValue<string>)[] = [];
    for (const item of attester) {
      keys.push(...extractAttesterKeys(item));
    }
    return keys;
  }

  if (attester && typeof attester === 'object') {
    const obj = attester as Record<string, unknown>;

    // New shape: { eth: EthAccount, bls?: BLSAccount }
    if ('eth' in obj) {
      return extractAttesterKeys(obj.eth);
    }

    // Remote signer account object shape: { address, remoteSignerUrl?, ... }
    if ('address' in obj) {
      return [String((obj as any).address)];
    }

    // JSON V3 keystore: { path, password } - use path as unique identifier
    if ('path' in obj) {
      return [String(obj.path)];
    }

    // Mnemonic-based account: { mnemonic, addressIndex? }
    if ('mnemonic' in obj) {
      const mnemonic = String(obj.mnemonic);
      const addressIndex = Number(obj.addressIndex ?? 0);
      // Combine mnemonic and index for uniqueness check
      return [`${mnemonic}:${addressIndex}`];
    }
  }

  // Fallback stringify for anything else (null/undefined)
  return [JSON.stringify(attester)];
}

/**
 * Redacts sensitive fields in attester keys for safe display in error messages.
 *
 * @param key The key to redact (may contain sensitive data).
 * @param attester The original attester config (to reconstruct redacted version).
 * @returns A redacted string safe for display.
 */
function redactAttesterKeyForDisplay(key: string | SecretValue<string>, attester: unknown): string {
  if (key instanceof SecretValue) {
    return '[REDACTED]';
  }

  // If the attester is an object with sensitive fields, reconstruct with redaction
  if (attester && typeof attester === 'object' && !Array.isArray(attester)) {
    const obj = attester as Record<string, unknown>;

    // JSON V3 keystore: { path, password }
    if ('path' in obj && 'password' in obj) {
      return JSON.stringify({ path: obj.path, password: '[REDACTED]' });
    }

    // Mnemonic-based account: { mnemonic, addressIndex? }
    if ('mnemonic' in obj) {
      const redacted: Record<string, unknown> = { mnemonic: '[REDACTED]' };
      if ('addressIndex' in obj) {
        redacted.addressIndex = obj.addressIndex;
      }
      return JSON.stringify(redacted);
    }

    // Remote signer with certPass
    if ('certPass' in obj) {
      const redacted = { ...obj, certPass: '[REDACTED]' };
      return JSON.stringify(redacted);
    }
  }

  // Try to parse as JSON and redact known sensitive fields
  try {
    const parsed = JSON.parse(key);
    if (typeof parsed === 'object' && parsed !== null) {
      const redacted = { ...parsed };
      let hasRedaction = false;
      if ('password' in redacted) {
        redacted.password = '[REDACTED]';
        hasRedaction = true;
      }
      if ('mnemonic' in redacted) {
        redacted.mnemonic = '[REDACTED]';
        hasRedaction = true;
      }
      if ('certPass' in redacted) {
        redacted.certPass = '[REDACTED]';
        hasRedaction = true;
      }
      if (hasRedaction) {
        return JSON.stringify(redacted);
      }
    }
  } catch {
    // Not JSON, continue
  }

  // Check if it looks like a mnemonic:index format
  const colonIndex = key.lastIndexOf(':');
  if (colonIndex > 0) {
    const maybeMnemonic = key.slice(0, colonIndex);
    const maybeIndex = key.slice(colonIndex + 1);
    // Mnemonics are typically 12+ words
    if (maybeMnemonic.split(' ').length >= 12) {
      return JSON.stringify({ mnemonic: '[REDACTED]', addressIndex: parseInt(maybeIndex, 10) || 0 });
    }
  }

  return key;
}
