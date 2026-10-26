import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { type FactScope, factScopeFromFields, factScopeToFields } from './fact_scope.js';

describe('FactScope wire encoding', () => {
  const account = AztecAddress.fromBigIntUnsafe(42n);

  it('serializes to the Noir [kind, account] layout', () => {
    expect(factScopeToFields({ type: 'account', account })).toEqual([new Fr(1n), new Fr(42n)]);
    expect(factScopeToFields({ type: 'public' })).toEqual([new Fr(2n), Fr.ZERO]);
  });

  it.each<FactScope>([{ type: 'account', account }, { type: 'public' }])('round-trips %j', scope => {
    const [kind, accountField] = factScopeToFields(scope);
    expect(factScopeFromFields(kind.toNumber(), accountField)).toEqual(scope);
  });

  it.each([0, 3, 99])('rejects unknown kind %i', kind => {
    expect(() => factScopeFromFields(kind, Fr.ZERO)).toThrow(`Unrecognized fact scope kind: ${kind}`);
  });

  it('rejects a public scope that names an account', () => {
    expect(() => factScopeFromFields(2, new Fr(42n))).toThrow('Public fact scope must not name an account');
  });
});
