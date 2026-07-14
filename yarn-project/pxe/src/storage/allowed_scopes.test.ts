import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { assertAllowedScope } from './allowed_scopes.js';

describe('assertAllowedScope', () => {
  const scopeA = AztecAddress.fromFieldUnsafe(new Fr(1));
  const scopeB = AztecAddress.fromFieldUnsafe(new Fr(2));

  it('permits a scope present in the allowed list', () => {
    expect(() => assertAllowedScope(scopeA, [scopeA, scopeB])).not.toThrow();
  });

  it('rejects a scope absent from the allowed list', () => {
    expect(() => assertAllowedScope(scopeA, [scopeB])).toThrow(/not in the allowed scopes/);
  });

  it('rejects the zero scope when it is not in the allowed list', () => {
    expect(() => assertAllowedScope(AztecAddress.ZERO, [scopeA])).toThrow(/not in the allowed scopes/);
  });

  it('permits the zero scope only when it is explicitly in the allowed list', () => {
    expect(() => assertAllowedScope(AztecAddress.ZERO, [AztecAddress.ZERO])).not.toThrow();
  });
});
