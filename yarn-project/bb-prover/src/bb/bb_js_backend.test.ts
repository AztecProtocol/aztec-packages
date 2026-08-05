import { ProvingError } from '@aztec/stdlib/errors';

import { BBJsInstance } from './bb_js_backend.js';

describe('BBJsInstance', () => {
  it('wraps bb startup failures as a retryable ProvingError', async () => {
    const err = await BBJsInstance.create('/nonexistent/bb-binary').catch(e => e);
    expect(err).toBeInstanceOf(ProvingError);
    expect(err.retry).toBe(true);
  });
});
