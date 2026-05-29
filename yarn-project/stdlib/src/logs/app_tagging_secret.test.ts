import { randomAppTaggingSecret } from '../tests/factories.js';
import { AppTaggingSecret } from './app_tagging_secret.js';

describe('AppTaggingSecret', () => {
  it('toString and fromString works', async () => {
    const secret = await randomAppTaggingSecret();
    const str = secret.toString();
    const parsed = AppTaggingSecret.fromString(str);

    expect(parsed.secret).toEqual(secret.secret);
    expect(parsed.app).toEqual(secret.app);
  });
});
