import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';

import { assertNoDefaultFields } from './assert_no_default_fields.js';

describe('assertNoDefaultFields', () => {
  it('passes when every field has a non-default value', () => {
    expect(() => assertNoDefaultFields('TypeA', { a: 1, b: 'hello', c: [Fr.ONE], d: true })).not.toThrow();
  });

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['null', null],
    ['0', 0],
    ['0n', 0n],
    ['empty string', ''],
    ['empty array', []],
    ['Fr.ZERO', Fr.ZERO],
    ['EthAddress.ZERO', EthAddress.ZERO],
  ])('throws when field has default value (%s)', (_label, value) => {
    expect(() => assertNoDefaultFields('TypeA', { good: 1, bad: value })).toThrow(
      /Fixture for TypeA is incomplete: field 'bad' is the type default/,
    );
  });

  it('reports the offending field name in the error message', () => {
    expect(() => assertNoDefaultFields('StoredNote', { noteDao: 'x', scopes: [], nullifiedAt: 5 })).toThrow(
      /field 'scopes'/,
    );
  });
});
