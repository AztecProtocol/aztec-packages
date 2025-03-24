import { SecretValue } from './secret_value.js';

describe('SecretValue', () => {
  it('protects the value from leaking as a string', () => {
    const val = new SecretValue('super secret');
    expect(String(val)).not.toContain('super secret');
  });

  it('protects the value from leaking in JSON', () => {
    const val = new SecretValue('super secret');
    expect(JSON.stringify(val)).not.toContain('super secret');
  });
});
