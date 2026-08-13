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

  it('skips regeneration when the artifact and generator are unchanged', async () => {
    await generateCode('out', 'CacheTest.json');
    expect(await exists('out/CacheTest.ts')).toBe(true);

    await rm('out/CacheTest.ts');
    await generateCode('out', 'CacheTest.json');
    expect(await exists('out/CacheTest.ts')).toBe(false);
  });

  it('regenerates when the cache was written by a different generator version', async () => {
    await generateCode('out', 'CacheTest.json');
    await rm('out/CacheTest.ts');

    const stale = JSON.parse(await readFile(cacheFile, 'utf8'));
    stale.cacheVersion = 0;
    await writeFile(cacheFile, JSON.stringify(stale));

    await generateCode('out', 'CacheTest.json');
    expect(await exists('out/CacheTest.ts')).toBe(true);
  });

  it('regenerates when the cache predates cache versioning', async () => {
    await generateCode('out', 'CacheTest.json');
    await rm('out/CacheTest.ts');

    const versioned = JSON.parse(await readFile(cacheFile, 'utf8'));
    await writeFile(cacheFile, JSON.stringify(versioned.contracts));

    await generateCode('out', 'CacheTest.json');
    expect(await exists('out/CacheTest.ts')).toBe(true);
  });
});
