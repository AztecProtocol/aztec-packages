import { MEGA_APP_VK_LENGTH_IN_FIELDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { LogFn } from '@aztec/foundation/log';

import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

type VerificationKeyRecord = {
  artifactPath: string;
  contractName: string;
  functionName: string;
  size: number;
};

type ArtifactCheck = {
  records: VerificationKeyRecord[];
  expectedSize?: number;
  incompatible: VerificationKeyRecord[];
  sizes: Map<number, VerificationKeyRecord[]>;
};

const INSTALLED_VK_SIZE = MEGA_APP_VK_LENGTH_IN_FIELDS * Fr.SIZE_IN_BYTES;

/** Scans compiled contract artifacts and throws when their verification keys are incompatible. */
export async function checkArtifacts(paths: string[], expected: 'installed' | undefined, log: LogFn): Promise<void> {
  const result = await inspectArtifacts(paths, expected === 'installed' ? INSTALLED_VK_SIZE : undefined);
  if (result.records.length === 0) {
    log('No private-function verification keys found.');
    return;
  }

  if (result.expectedSize !== undefined && result.incompatible.length > 0) {
    log(`FAIL: incompatible verification key size for the installed Aztec toolchain.`);
    log(
      `  Expected ${result.expectedSize} bytes; ${result.incompatible.length} of ${result.records.length} keys differ.`,
    );
    for (const record of result.incompatible) {
      log(`    ${record.contractName}::${record.functionName} — ${record.size} bytes (${record.artifactPath})`);
    }
    log('  Rebuild all contract artifacts with the pinned toolchain.');
    throw new Error('Incompatible contract artifacts detected');
  }

  if (result.sizes.size > 1) {
    log('FAIL: mixed verification key sizes detected; consistency alone cannot identify which artifacts are stale.');
    for (const [size, records] of result.sizes) {
      log(`  ${size} bytes: ${records.length} key(s)`);
      for (const record of records) {
        log(`    ${record.contractName}::${record.functionName} (${record.artifactPath})`);
      }
    }
    log('  Rebuild all contract artifacts with the pinned toolchain.');
    throw new Error('Mixed contract artifact verification key sizes detected');
  }

  log(`OK: checked ${result.records.length} private-function verification key(s).`);
}

/** Reads artifact JSON and groups private-function verification keys by their serialized byte size. */
export async function inspectArtifacts(paths: string[], expectedSize?: number): Promise<ArtifactCheck> {
  const files = await collectJsonFiles(paths);
  const records = (await Promise.all(files.map(readArtifactVerificationKeys))).flat();
  const sizes = new Map<number, VerificationKeyRecord[]>();
  for (const record of records) {
    sizes.set(record.size, [...(sizes.get(record.size) ?? []), record]);
  }
  return {
    records,
    expectedSize,
    incompatible: expectedSize === undefined ? [] : records.filter(record => record.size !== expectedSize),
    sizes,
  };
}

async function collectJsonFiles(paths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const input of paths) {
    const path = resolve(input);
    const info = await stat(path);
    if (info.isFile()) {
      if (extname(path) === '.json') {
        files.push(path);
      }
      continue;
    }
    if (!info.isDirectory()) {
      continue;
    }
    const entries = await readdir(path, { withFileTypes: true });
    files.push(...(await collectJsonFiles(entries.map(entry => join(path, entry.name)))));
  }
  return files.sort();
}

async function readArtifactVerificationKeys(artifactPath: string): Promise<VerificationKeyRecord[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(artifactPath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse JSON file ${artifactPath}`, { cause: error });
  }
  if (!isRecord(parsed) || typeof parsed.name !== 'string' || !Array.isArray(parsed.functions)) {
    return [];
  }

  const records: VerificationKeyRecord[] = [];
  for (const fn of parsed.functions) {
    if (!isRecord(fn) || typeof fn.name !== 'string') {
      continue;
    }
    const verificationKey =
      typeof fn.verification_key === 'string'
        ? fn.verification_key
        : typeof fn.verificationKey === 'string'
          ? fn.verificationKey
          : undefined;
    if (verificationKey === undefined) {
      continue;
    }
    records.push({
      artifactPath,
      contractName: parsed.name,
      functionName: fn.name,
      size: decodeVerificationKey(verificationKey).length,
    });
  }
  return records;
}

function decodeVerificationKey(value: string): Buffer {
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return Buffer.from(value.slice(2), 'hex');
  }
  return Buffer.from(value, 'base64');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
