import { Fr } from '@aztec/foundation/curves/bn254';

import { ProvidedSecret } from './provided_secret.js';

describe('ProvidedSecret', () => {
  it('deserializes the secret from a single field', () => {
    const provided = ProvidedSecret.fromFields([new Fr(42)]);
    expect(provided.secret).toEqual(new Fr(42));
  });
});
