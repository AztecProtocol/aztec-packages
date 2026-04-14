import { randomBytes } from '@aztec/foundation/crypto/random';
import { sha256Hash } from '@aztec/foundation/json-rpc/server';
import type { Logger } from '@aztec/foundation/log';

import { promises as fs } from 'fs';
import { join } from 'path';

/** Subdirectory under dataDirectory for admin API key storage. */
const ADMIN_STORE_DIR = 'admin';
const HASH_FILE_NAME = 'api_key_hash';

/**
 * Result of resolving the admin API key.
 * Contains the SHA-256 hex hash of the API key to be used by the auth middleware,
 * and optionally the raw key when newly generated (so the caller can display it).
 */
export interface AdminApiKeyResolution {
  /** The SHA-256 hash of the API key. */
  apiKeyHash: Buffer;
  /**
   * The raw API key, only present when a new key was generated during this call.
   * The caller MUST display this to the operator — it will not be stored or returned again.
   */
  rawKey?: string;
}

export interface ResolveAdminApiKeyOptions {
  /** SHA-256 hex hash of a pre-generated API key. When set, the node uses this hash directly. */
  adminApiKeyHash?: string;
  /** If true, disable admin API key auth entirely. */
  disableAdminApiKey?: boolean;
  /** If true, force-generate a new key even if one is already persisted. */
  resetAdminApiKey?: boolean;
  /** Root data directory for persistent storage. */
  dataDirectory?: string;
}

/**
 * Resolves the admin API key for the admin RPC endpoint.
 *
 * Strategy:
 * 1. If opt-out flag is set (`disableAdminApiKey`), return undefined (no auth).
 * 2. If a pre-generated hash is provided (`adminApiKeyHash`), use it directly.
 * 3. If a data directory exists, look for a persisted hash file
 *    at `<dataDirectory>/admin/api_key_hash`:
 *    - If `resetAdminApiKey` is set, skip loading and force-generate a new key.
 *    - Found: use the stored hash (operator already saved the key from first run).
 *    - Not found: auto-generate a random key, display it once, persist the hash.
 * 3. If no data directory: generate a random key
 *    each run and display it (cannot persist).
 *
 * @param options - The options for resolving the admin API key.
 * @param log - Logger for outputting the key and status messages.
 * @returns The resolved API key hash, or undefined if auth is disabled.
 */
export async function resolveAdminApiKey(
  options: ResolveAdminApiKeyOptions,
  log: Logger,
): Promise<AdminApiKeyResolution | undefined> {
  // Operator explicitly opted out of admin auth
  if (options.disableAdminApiKey) {
    log.warn('Admin API key authentication is DISABLED (--disable-admin-api-key / AZTEC_DISABLE_ADMIN_API_KEY)');
    return undefined;
  }

  // Operator provided a pre-generated hash (e.g. via AZTEC_ADMIN_API_KEY_HASH env var)
  if (options.adminApiKeyHash) {
    const hex = options.adminApiKeyHash.trim();
    if (hex.length !== 64 || !/^[0-9a-f]{64}$/.test(hex)) {
      throw new Error(`Invalid admin API key hash: expected 64-char hex string, got "${hex}"`);
    }
    log.info('Admin API key authentication enabled (using pre-configured key hash)');
    return { apiKeyHash: Buffer.from(hex, 'hex') };
  }

  // Persistent storage available, load or generate key
  if (options.dataDirectory) {
    const adminDir = join(options.dataDirectory, ADMIN_STORE_DIR);
    const hashFilePath = join(adminDir, HASH_FILE_NAME);

    // Unless a reset is forced, try to load the existing hash from disk
    if (!options.resetAdminApiKey) {
      try {
        const storedHash = (await fs.readFile(hashFilePath, 'utf-8')).trim();
        if (storedHash.length === 64) {
          log.info('Admin API key authentication enabled (loaded stored key hash from disk)');
          return { apiKeyHash: Buffer.from(storedHash, 'hex') };
        }
        log.warn(`Invalid stored admin API key hash at ${hashFilePath}, regenerating...`);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          log.warn(`Failed to read admin API key hash from ${hashFilePath}: ${err.message}`);
        }
        // File doesn't exist — fall through to generate
      }
    } else {
      log.warn('Admin API key reset requested — generating a new key');
    }

    // Generate a new key, persist the hash, and return the raw key for the caller to display
    const { rawKey, hash } = generateApiKey();
    await fs.mkdir(adminDir, { recursive: true });
    await fs.writeFile(hashFilePath, hash.toString('hex'), 'utf-8');
    // Set restrictive permissions (owner read/write only)
    await fs.chmod(hashFilePath, 0o600);

    log.info('Admin API key authentication enabled (new key generated and hash persisted to disk)');
    return { apiKeyHash: hash, rawKey };
  }

  // No data directory, generate a temporary key per session
  const { rawKey, hash } = generateApiKey();

  log.warn('No data directory configured — admin API key cannot be persisted.');
  log.warn('A temporary key has been generated for this session only.');

  return { apiKeyHash: hash, rawKey };
}

/**
 * Generates a cryptographically random API key and its SHA-256 hash.
 * @returns The raw key (hex string) and its SHA-256 hash as a Buffer.
 */
function generateApiKey(): { rawKey: string; hash: Buffer } {
  const rawKey = randomBytes(32).toString('hex');
  const hash = sha256Hash(rawKey);
  return { rawKey, hash };
}
