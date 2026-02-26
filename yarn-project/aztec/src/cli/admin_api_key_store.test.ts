import { sha256Hash } from '@aztec/foundation/json-rpc/server';
import { createLogger } from '@aztec/foundation/log';

import { promises as fs } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { type ResolveAdminApiKeyOptions, resolveAdminApiKey } from './admin_api_key_store.js';

describe('resolveAdminApiKey', () => {
  const log = createLogger('test:admin-api-key');
  let tempDir: string | undefined;

  beforeEach(() => {
    tempDir = undefined;
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('opt-out (disableAdminApiKey = true)', () => {
    it('returns undefined when auth is disabled', async () => {
      const result = await resolveAdminApiKey({ disableAdminApiKey: true }, log);
      expect(result).toBeUndefined();
    });
  });

  describe('ephemeral mode (no dataDirectory)', () => {
    it('returns a key resolution with rawKey and apiKeyHash', async () => {
      const result = await resolveAdminApiKey({}, log);
      expect(result).toBeDefined();
      expect(result!.rawKey).toBeDefined();
      expect(result!.apiKeyHash).toBeDefined();
    });

    it('returns rawKey that is a 64-char hex string', async () => {
      const result = await resolveAdminApiKey({}, log);
      expect(result!.rawKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns apiKeyHash that is SHA-256 of rawKey', async () => {
      const result = await resolveAdminApiKey({}, log);
      expect(result!.apiKeyHash).toEqual(sha256Hash(result!.rawKey!));
    });

    it('generates a different key each call', async () => {
      const result1 = await resolveAdminApiKey({}, log);
      const result2 = await resolveAdminApiKey({}, log);
      expect(result1!.rawKey).not.toBe(result2!.rawKey);
    });
  });

  describe('persistent mode (with dataDirectory)', () => {
    let opts: ResolveAdminApiKeyOptions;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'aztec-api-key-test-'));
      opts = { dataDirectory: tempDir };
    });

    it('generates a new key on first run', async () => {
      const result = await resolveAdminApiKey(opts, log);
      expect(result).toBeDefined();
      expect(result!.rawKey).toBeDefined();
      expect(result!.rawKey).toMatch(/^[0-9a-f]{64}$/);
      expect(result!.apiKeyHash).toEqual(sha256Hash(result!.rawKey!));
    });

    it('persists the hash to disk on first run', async () => {
      const result = await resolveAdminApiKey(opts, log);
      const hashFilePath = join(tempDir!, 'admin', 'api_key_hash');
      const storedHash = (await fs.readFile(hashFilePath, 'utf-8')).trim();
      expect(storedHash).toBe(result!.apiKeyHash.toString('hex'));
    });

    it('sets restrictive permissions on the hash file', async () => {
      await resolveAdminApiKey(opts, log);
      const hashFilePath = join(tempDir!, 'admin', 'api_key_hash');
      const stat = await fs.stat(hashFilePath);
      expect(stat.mode & 0o777).toBe(0o600);
    });

    it('loads the stored hash on subsequent runs (no rawKey)', async () => {
      // First run, generates and persists
      const firstResult = await resolveAdminApiKey(opts, log);
      const firstHash = firstResult!.apiKeyHash;

      // Second run, loads from disk
      const secondResult = await resolveAdminApiKey(opts, log);

      expect(secondResult).toBeDefined();
      expect(secondResult!.apiKeyHash).toEqual(firstHash);
      expect(secondResult!.rawKey).toBeUndefined(); // Not newly generated
    });

    it('regenerates if stored hash is invalid (wrong length)', async () => {
      // Write an invalid hash
      const adminDir = join(tempDir!, 'admin');
      await fs.mkdir(adminDir, { recursive: true });
      await fs.writeFile(join(adminDir, 'api_key_hash'), 'tooshort', 'utf-8');

      const result = await resolveAdminApiKey(opts, log);
      expect(result).toBeDefined();
      expect(result!.rawKey).toBeDefined(); // Freshly generated
      expect(result!.apiKeyHash).toEqual(sha256Hash(result!.rawKey!));
    });

    it('creates the admin subdirectory if it does not exist', async () => {
      await resolveAdminApiKey(opts, log);
      const adminDir = join(tempDir!, 'admin');
      const stat = await fs.stat(adminDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('reset (resetAdminApiKey = true)', () => {
    let opts: ResolveAdminApiKeyOptions;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'aztec-api-key-test-'));
      opts = { dataDirectory: tempDir, resetAdminApiKey: true };
    });

    it('generates a new key even when a valid hash already exists', async () => {
      // First run, normal generation
      const firstResult = await resolveAdminApiKey({ dataDirectory: tempDir }, log);
      const firstHash = firstResult!.apiKeyHash;

      // Second run with reset, should generate a new key
      const resetResult = await resolveAdminApiKey(opts, log);

      expect(resetResult).toBeDefined();
      expect(resetResult!.rawKey).toBeDefined(); // New raw key returned
      expect(resetResult!.apiKeyHash).not.toEqual(firstHash); // Different hash
      expect(resetResult!.apiKeyHash).toEqual(sha256Hash(resetResult!.rawKey!));
    });

    it('overwrites the persisted hash file', async () => {
      // First run — normal generation
      await resolveAdminApiKey({ dataDirectory: tempDir }, log);
      const hashFilePath = join(tempDir!, 'admin', 'api_key_hash');
      const oldHash = (await fs.readFile(hashFilePath, 'utf-8')).trim();

      // Reset run
      const resetResult = await resolveAdminApiKey(opts, log);
      const newHash = (await fs.readFile(hashFilePath, 'utf-8')).trim();

      expect(newHash).not.toBe(oldHash);
      expect(newHash).toBe(resetResult!.apiKeyHash.toString('hex'));
    });

    it('works even when no hash file exists yet (first run with reset)', async () => {
      const result = await resolveAdminApiKey(opts, log);

      expect(result).toBeDefined();
      expect(result!.rawKey).toBeDefined();
      expect(result!.apiKeyHash).toEqual(sha256Hash(result!.rawKey!));
    });

    it('has no effect in ephemeral mode (always generates anyway)', async () => {
      const result = await resolveAdminApiKey({ resetAdminApiKey: true }, log);
      expect(result).toBeDefined();
      expect(result!.rawKey).toBeDefined();
    });
  });
});
