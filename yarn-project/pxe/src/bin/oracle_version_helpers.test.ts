import { keccak256String } from '@aztec/foundation/crypto/keccak';

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { ORACLE_INTERFACE_HASH } from '../oracle_version.js';
import { getOracleRegistrySignature, readNumericGlobal } from './oracle_version_helpers.js';

describe('readNumericGlobal', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'oracle-version-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('extracts the value from a Noir global declaration', () => {
    const path = writeFixture(
      dir,
      'version.nr',
      `pub global ORACLE_VERSION_MAJOR: Field = 28;\npub global ORACLE_VERSION_MINOR: Field = 3;\n`,
    );
    expect(readNumericGlobal(path, 'ORACLE_VERSION_MAJOR')).toBe(28);
    expect(readNumericGlobal(path, 'ORACLE_VERSION_MINOR')).toBe(3);
  });

  it('extracts the value from a TypeScript const declaration', () => {
    const path = writeFixture(dir, 'oracle_version.ts', `export const ORACLE_VERSION_MAJOR = 28;\n`);
    expect(readNumericGlobal(path, 'ORACLE_VERSION_MAJOR')).toBe(28);
  });

  it('reads the declaration and ignores later usages of the constant', () => {
    const path = writeFixture(
      dir,
      'usage.nr',
      `pub global TXE_ORACLE_VERSION_MAJOR: Field = 5;\nfoo(TXE_ORACLE_VERSION_MAJOR, TXE_ORACLE_VERSION_MINOR);\n`,
    );
    expect(readNumericGlobal(path, 'TXE_ORACLE_VERSION_MAJOR')).toBe(5);
  });

  it('does not match a constant whose name extends the requested name', () => {
    const path = writeFixture(dir, 'prefixed.nr', `pub global SOME_ORACLE_VERSION_MAJOR: Field = 9;\n`);
    expect(() => readNumericGlobal(path, 'ORACLE_VERSION_MAJOR')).toThrow(/Could not find numeric global/);
  });

  it('throws when the global is absent', () => {
    const path = writeFixture(dir, 'empty.nr', `pub global SOMETHING_ELSE: Field = 1;\n`);
    expect(() => readNumericGlobal(path, 'ORACLE_VERSION_MAJOR')).toThrow(/Could not find numeric global/);
  });
});

describe('getOracleRegistrySignature', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'oracle-registry-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const SAMPLE_REGISTRY = `export const ORACLE_REGISTRY = {
    aztec_utl_foo: makeEntry({
      params: [
        { name: 'a', type: U32 },
        { name: 'b', type: OPTION(AZTEC_ADDRESS) },
      ],
      returnType: BOOL,
    }),
    aztec_utl_bar: makeEntry({ returnType: FIELD }),
    aztec_prv_baz: makeEntry({ params: [{ name: 'x', type: FIELD }] }),
    aztec_prv_qux: makeEntry(),
  } satisfies Record<string, OracleRegistryEntry>;
`;

  it('builds a sorted signature of names, ordered typed params, and return types', () => {
    const path = writeFixture(dir, 'registry.ts', SAMPLE_REGISTRY);
    expect(getOracleRegistrySignature(path, 'ORACLE_REGISTRY')).toBe(
      'aztec_prv_baz(x: FIELD): void\n' +
        'aztec_prv_qux(): void\n' +
        'aztec_utl_bar(): FIELD\n' +
        'aztec_utl_foo(a: U32, b: OPTION(AZTEC_ADDRESS)): BOOL',
    );
  });

  it('changes when a parameter type changes (the gap the Oracle-class hash missed)', () => {
    const before = writeFixture(dir, 'before.ts', SAMPLE_REGISTRY);
    const after = writeFixture(dir, 'after.ts', SAMPLE_REGISTRY.replace('type: OPTION(AZTEC_ADDRESS)', 'type: FIELD'));
    expect(getOracleRegistrySignature(after, 'ORACLE_REGISTRY')).not.toBe(
      getOracleRegistrySignature(before, 'ORACLE_REGISTRY'),
    );
  });

  it('is insensitive to formatting of the type expressions', () => {
    const reformatted = writeFixture(
      dir,
      'reformatted.ts',
      SAMPLE_REGISTRY.replace('OPTION(AZTEC_ADDRESS)', 'OPTION(\n        AZTEC_ADDRESS\n      )'),
    );
    const original = writeFixture(dir, 'original.ts', SAMPLE_REGISTRY);
    expect(getOracleRegistrySignature(reformatted, 'ORACLE_REGISTRY')).toBe(
      getOracleRegistrySignature(original, 'ORACLE_REGISTRY'),
    );
  });

  it('throws on spread members, which are not yet supported', () => {
    const path = writeFixture(
      dir,
      'spread.ts',
      `export const ORACLE_REGISTRY = {
        ...BASE_REGISTRY,
        aztec_utl_foo: makeEntry({ returnType: FIELD }),
      } satisfies Record<string, OracleRegistryEntry>;\n`,
    );
    expect(() => getOracleRegistrySignature(path, 'ORACLE_REGISTRY')).toThrow(/Spread elements are not supported/);
  });

  it('throws when the registry is absent', () => {
    const path = writeFixture(dir, 'absent.ts', `export const SOMETHING_ELSE = {};\n`);
    expect(() => getOracleRegistrySignature(path, 'ORACLE_REGISTRY')).toThrow(/Could not find oracle registry/);
  });

  it('matches the recorded ORACLE_INTERFACE_HASH for the real registry', () => {
    const registryPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../contract_function_simulator/oracle/oracle_registry.ts',
    );
    const signature = getOracleRegistrySignature(registryPath, 'ORACLE_REGISTRY');
    expect(keccak256String(signature)).toBe(ORACLE_INTERFACE_HASH);
  });
});

const writeFixture = (dir: string, name: string, contents: string): string => {
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
};
