import { waitForSandbox } from '@aztec/aztec.js';

import { execSync } from 'child_process';

// Entrypoint for running the up-quick-start script on the CI
describe('guides/up_quick_start', () => {
  it('works', async () => {
    await waitForSandbox();
    // eslint-disable-next-line no-console
    console.log(`Sandbox ready`);
    execSync(`PATH=$PATH:../node_modules/.bin ./src/guides/up_quick_start.sh`, { shell: '/bin/bash', stdio: 'pipe' });
  }, 90_000);
});
