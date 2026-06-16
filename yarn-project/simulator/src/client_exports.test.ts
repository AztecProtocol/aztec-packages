import { readFileSync } from 'node:fs';

describe('client entrypoint', () => {
  it('does not export circuit recording modules', () => {
    const clientEntrypoint = readFileSync(new URL('./client.ts', import.meta.url), 'utf8');

    expect(clientEntrypoint).not.toContain('circuit_recording');
  });
});
