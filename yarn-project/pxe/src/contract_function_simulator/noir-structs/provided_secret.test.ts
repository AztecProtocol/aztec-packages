import { Fr } from '@aztec/foundation/curves/bn254';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import { ProvidedSecret } from './provided_secret.js';

describe('ProvidedSecret', () => {
  it('deserializes mode 2 as unconstrained', () => {
    const provided = ProvidedSecret.fromFields([new Fr(42), new Fr(2)]);
    expect(provided.secret).toEqual(new Fr(42));
    expect(provided.mode).toBe(AppTaggingSecretKind.UNCONSTRAINED);
  });

  it('deserializes mode 3 as constrained', () => {
    const provided = ProvidedSecret.fromFields([new Fr(42), new Fr(3)]);
    expect(provided.secret).toEqual(new Fr(42));
    expect(provided.mode).toBe(AppTaggingSecretKind.CONSTRAINED);
  });

  it('rejects invalid modes', () => {
    expect(() => ProvidedSecret.fromFields([new Fr(42), new Fr(1)])).toThrow('Unrecognized delivery mode for tagging');
  });
});
