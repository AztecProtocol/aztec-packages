/**
 * Keystore File Loader
 *
 * Handles loading and parsing keystore configuration files.
 */
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
    return keystoreSchema.parse(JSON.parse(content));
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
          if (attesterAddresses.has(key)) {
            throw new KeyStoreLoadError(
              `Duplicate attester address ${key} found across keystore files`,
              `keystores[${i}].validators`,
            );
          }
          attesterAddresses.add(key);
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
function extractAttesterKeys(attester: unknown): string[] {
  // String forms (private key or other) - return as-is for coarse uniqueness
  if (typeof attester === 'string') {
    return [attester];
  }

  // Arrays of attester items
  if (Array.isArray(attester)) {
    const keys: string[] = [];
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

    // Mnemonic or other object shapes: stringify
    return [JSON.stringify(attester)];
  }

  // Fallback stringify for anything else (null/undefined)
  return [JSON.stringify(attester)];
}
