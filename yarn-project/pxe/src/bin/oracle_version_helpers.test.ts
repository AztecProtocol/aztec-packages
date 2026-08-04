/* eslint-disable camelcase */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { ARRAY, AZTEC_ADDRESS, BOOL, FIELD, OPTION, U32, makeEntry } from '../contract_function_simulator/index.js';
import { TX_HASH } from '../contract_function_simulator/oracle/oracle_type_mappings.js';
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
  const SAMPLE_REGISTRY = {
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
  };

  it('builds a sorted signature of names, ordered typed params, and return types', () => {
    expect(getOracleRegistrySignature(SAMPLE_REGISTRY)).toBe(
      'aztec_prv_baz(x: field): void\n' +
        'aztec_prv_qux(): void\n' +
        'aztec_utl_bar(): field\n' +
        'aztec_utl_foo(a: u32, b: option(aztec-address)): bool',
    );
  });

  it('changes when a parameter type changes (the gap the Oracle-class hash missed)', () => {
    const after = {
      ...SAMPLE_REGISTRY,
      aztec_utl_foo: makeEntry({
        params: [
          { name: 'a', type: U32 },
          { name: 'b', type: FIELD },
        ],
        returnType: BOOL,
      }),
    };
    expect(getOracleRegistrySignature(after)).not.toBe(getOracleRegistrySignature(SAMPLE_REGISTRY));
  });

  it('does not change when a mapping is swapped for a wire-equivalent one', () => {
    const withField = { aztec_utl_foo: makeEntry({ params: [{ name: 'a', type: FIELD }] }) };
    const withTxHash = { aztec_utl_foo: makeEntry({ params: [{ name: 'a', type: TX_HASH }] }) };
    expect(getOracleRegistrySignature(withTxHash)).toBe(getOracleRegistrySignature(withField));
  });

  it('captures nested composite kinds in the signature', () => {
    const registry = {
      aztec_utl_foo: makeEntry({ params: [{ name: 'a', type: OPTION(ARRAY(FIELD)) }], returnType: AZTEC_ADDRESS }),
    };
    expect(getOracleRegistrySignature(registry)).toBe('aztec_utl_foo(a: option(array(field))): aztec-address');
  });
});

const writeFixture = (dir: string, name: string, contents: string): string => {
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
};
