import { Fr } from '@aztec/foundation/curves/bn254';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import { ProvidedSecret } from './provided_secret.js';

describe('ProvidedSecret', () => {
  it('deserializes delivery mode 2 as unconstrained', () => {
    const provided = ProvidedSecret.fromFields([new Fr(42), new Fr(2)]);
    expect(provided.secret).toEqual(new Fr(42));
    expect(provided.mode).toEqual(AppTaggingSecretKind.UNCONSTRAINED);
  });

  it('deserializes delivery mode 3 as constrained', () => {
    const provided = ProvidedSecret.fromFields([new Fr(42), new Fr(3)]);
    expect(provided.secret).toEqual(new Fr(42));
    expect(provided.mode).toEqual(AppTaggingSecretKind.CONSTRAINED);
  });

  it('rejects an invalid mode value', () => {
    expect(() => ProvidedSecret.fromFields([Fr.random(), new Fr(99)])).toThrow(
      'Unrecognized delivery mode for tagging',
    );
  });
});
