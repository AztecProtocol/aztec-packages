import { Fr } from '@aztec/foundation/curves/bn254';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import { ProvidedSecret } from './provided_secret.js';

describe('ProvidedSecret', () => {
  it('deserializes mode 0 as unconstrained', () => {
    const provided = ProvidedSecret.fromFields([new Fr(42), new Fr(0)]);
    expect(provided.secret).toEqual(new Fr(42));
    expect(provided.mode).toEqual(AppTaggingSecretKind.UNCONSTRAINED);
  });

  it('deserializes mode 1 as constrained', () => {
    const provided = ProvidedSecret.fromFields([new Fr(42), new Fr(1)]);
    expect(provided.secret).toEqual(new Fr(42));
    expect(provided.mode).toEqual(AppTaggingSecretKind.CONSTRAINED);
  });

  it('rejects an invalid mode value', () => {
    expect(() => ProvidedSecret.fromFields([Fr.random(), new Fr(2)])).toThrow('Invalid app tagging secret kind');
  });
});
