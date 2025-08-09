/**
 * Keystore File Loader
 *
 * Handles loading and parsing keystore configuration files.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { extname, join } from 'path';

import { keystoreSchema } from './schemas.js';
import type { KeyStore } from './types.js';

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
 * Loads and validates a single keystore file using Zod schema validation
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
      // Zod validation error - format like Aztec does
      const issues = (error as any).issues;
      const message =
        issues.map((e: any) => `${e.message} (${e.path.join('.')})`).join('. ') || 'Schema validation error';
      throw new KeyStoreLoadError(`Schema validation failed: ${message}`, filePath, error as unknown as Error);
    }
    throw new KeyStoreLoadError(`Unexpected error: ${error}`, filePath, error as Error);
  }
}

/**
 * Loads keystore files from a directory (only .json files)
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
 * Loads keystore(s) from a path (file or directory)
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

    // Handle file not found errors
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new KeyStoreLoadError('File or directory not found', path, error as Error);
    }

    throw new KeyStoreLoadError(`Failed to access path`, path, error as Error);
  }
}

/**
 * Loads keystore(s) from multiple paths (comma-separated string or array)
 */
export function loadMultipleKeystores(paths: string | string[]): KeyStore[] {
  const pathArray = typeof paths === 'string' ? paths.split(',').map(p => p.trim()) : paths;
  const allKeystores: KeyStore[] = [];

  for (const path of pathArray) {
    if (!path) continue; // Skip empty paths

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
 * Validates that there are no conflicts (e.g., duplicate attester addresses).
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

    // Merge slasher (last one wins, but warn about conflicts)
    if (keystore.slasher) {
      if (merged.slasher) {
        console.warn('Multiple slasher configurations found, using the last one');
      }
      merged.slasher = keystore.slasher;
    }

    // Merge remote signer (last one wins, but warn about conflicts)
    if (keystore.remoteSigner) {
      if (merged.remoteSigner) {
        console.warn('Multiple default remote signer configurations found, using the last one');
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
 * Helper function to extract attester addresses/keys for duplicate checking.
 * This is a simplified version - the full implementation would be in the resolver.
 */
function extractAttesterKeys(attester: unknown): string[] {
  // This is a simplified implementation for duplicate detection
  // In a real implementation, you'd fully resolve the accounts
  if (typeof attester === 'string') {
    return [attester];
  }

  if (Array.isArray(attester)) {
    return attester.map(a => (typeof a === 'string' ? a : JSON.stringify(a)));
  }

  if (attester && typeof attester === 'object' && 'address' in attester) {
    return [(attester as { address: string }).address];
  }

  return [JSON.stringify(attester)];
}
