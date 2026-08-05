/* eslint-disable camelcase */
import { ARRAY, AZTEC_ADDRESS, BOOL, FIELD, OPTION, U32, makeEntry } from '../contract_function_simulator/index.js';
import { TX_HASH } from '../contract_function_simulator/oracle/oracle_type_mappings.js';
import { getOracleRegistrySignature } from './oracle_version_helpers.js';

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
