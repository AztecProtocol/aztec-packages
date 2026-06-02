import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { readNumericGlobal } from './check_oracle_version.js';

describe('readNumericGlobal', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'oracle-version-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writeFixture = (name: string, contents: string): string => {
    const path = join(dir, name);
    writeFileSync(path, contents);
    return path;
  };

  it('extracts the value from a Noir global declaration', () => {
    const path = writeFixture(
      'version.nr',
      `pub global ORACLE_VERSION_MAJOR: Field = 28;\npub global ORACLE_VERSION_MINOR: Field = 3;\n`,
    );
    expect(readNumericGlobal(path, 'ORACLE_VERSION_MAJOR')).toBe(28);
    expect(readNumericGlobal(path, 'ORACLE_VERSION_MINOR')).toBe(3);
  });

  it('extracts the value from a TypeScript const declaration', () => {
    const path = writeFixture('oracle_version.ts', `export const ORACLE_VERSION_MAJOR = 28;\n`);
    expect(readNumericGlobal(path, 'ORACLE_VERSION_MAJOR')).toBe(28);
  });

  it('reads the declaration and ignores later usages of the constant', () => {
    const path = writeFixture(
      'usage.nr',
      `pub global TXE_ORACLE_VERSION_MAJOR: Field = 5;\nfoo(TXE_ORACLE_VERSION_MAJOR, TXE_ORACLE_VERSION_MINOR);\n`,
    );
    expect(readNumericGlobal(path, 'TXE_ORACLE_VERSION_MAJOR')).toBe(5);
  });

  it('does not match a constant whose name extends the requested name', () => {
    const path = writeFixture('prefixed.nr', `pub global SOME_ORACLE_VERSION_MAJOR: Field = 9;\n`);
    expect(() => readNumericGlobal(path, 'ORACLE_VERSION_MAJOR')).toThrow(/Could not find numeric global/);
  });

  it('throws when the global is absent', () => {
    const path = writeFixture('empty.nr', `pub global SOMETHING_ELSE: Field = 1;\n`);
    expect(() => readNumericGlobal(path, 'ORACLE_VERSION_MAJOR')).toThrow(/Could not find numeric global/);
  });
});
