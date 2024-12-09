import { createPXEClient, waitForPXE } from '@aztec/aztec.js';

import { execSync } from 'child_process';

const { PXE_URL = '' } = process.env;

// Entrypoint for running the up-quick-start script on the CI
describe('guides/up_quick_start', () => {
  // TODO: update to not use CLI
  it('works', async () => {
    await waitForPXE(createPXEClient(PXE_URL));
    execSync(`LOG_LEVEL=\${LOG_LEVEL:-verbose} ./src/guides/up_quick_start.sh`, {
      shell: '/bin/bash',
      stdio: 'inherit',
    });
  });
});
