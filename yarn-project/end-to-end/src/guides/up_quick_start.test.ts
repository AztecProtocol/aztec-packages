import { createAztecNodeClient, waitForNode } from '@aztec/aztec.js';

import { jest } from '@jest/globals';
import { execSync } from 'child_process';

const { AZTEC_NODE_URL = '' } = process.env;

// Entrypoint for running the up-quick-start script on the CI
describe('guides/up_quick_start', () => {
  jest.setTimeout(60_000);

  // TODO: update to not use CLI
  it('works', async () => {
    await waitForNode(createAztecNodeClient(AZTEC_NODE_URL));
    execSync(
      `LOG_LEVEL=\${LOG_LEVEL:-verbose} AZTEC_NODE_URL=\${AZTEC_NODE_URL:-http://localhost:8080} ./src/guides/up_quick_start.sh`,
      {
        shell: '/bin/bash',
        stdio: 'inherit',
      },
    );
  });
});
