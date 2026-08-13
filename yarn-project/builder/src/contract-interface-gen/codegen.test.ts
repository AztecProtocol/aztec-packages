import { access, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

import { generateCode } from './codegen.js';

const cacheFile = 'codegenCache.json';

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('generateCode cache', () => {
  const outputFile = 'out/CacheTest.ts';
  let workDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    workDir = await mkdtemp(path.join(tmpdir(), 'codegen-cache-'));
    process.chdir(workDir);
    await writeFile(
      'CacheTest.json',
      JSON.stringify({
        name: 'CacheTest',
        // eslint-disable-next-line camelcase
        aztec_version: '1.0.0',
        transpiled: true,
        functions: [],
        outputs: { structs: {}, globals: {} },
        // eslint-disable-next-line camelcase
        file_map: {},
      }),
    );
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(workDir, { recursive: true, force: true });
  });

  it('regenerates when the cached output is missing', async () => {
    await generateCode('out', 'CacheTest.json');
    expect(await exists(outputFile)).toBe(true);

    await rm(outputFile);
    await generateCode('out', 'CacheTest.json');
    expect(await exists(outputFile)).toBe(true);
  });

  it('regenerates when the cache was written by a different generator version', async () => {
    await generateCode('out', 'CacheTest.json');
    await writeFile(outputFile, 'stale generated output');

    await generateCode('out', 'CacheTest.json');
    expect(await readFile(outputFile, 'utf8')).toBe('stale generated output');

    const versioned = JSON.parse(await readFile(cacheFile, 'utf8'));
    await writeFile(cacheFile, JSON.stringify({ ...versioned, cacheVersion: versioned.cacheVersion - 1 }));

    await generateCode('out', 'CacheTest.json');
    expect(await readFile(outputFile, 'utf8')).not.toBe('stale generated output');
  });
});
