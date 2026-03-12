import { randomExtendedDirectionalAppTaggingSecret } from '../tests/factories.js';
import { ExtendedDirectionalAppTaggingSecret } from './extended_directional_app_tagging_secret.js';

describe('ExtendedDirectionalAppTaggingSecret', () => {
  it('toString and fromString works', async () => {
    const secret = await randomExtendedDirectionalAppTaggingSecret();
    const str = secret.toString();
    const parsed = ExtendedDirectionalAppTaggingSecret.fromString(str);

    expect(parsed.secret).toEqual(secret.secret);
    expect(parsed.app).toEqual(secret.app);
  });
});
