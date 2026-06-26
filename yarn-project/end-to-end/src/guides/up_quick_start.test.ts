import { createAztecNodeClient, waitForNode } from '@aztec/aztec.js/node';

import { execSync } from 'child_process';

const { AZTEC_NODE_URL = 'http://localhost:8080' } = process.env;

// Entrypoint for running the up-quick-start script on the CI.
// Connects to AZTEC_NODE_URL (pre-started docker-compose network) then shells out to up_quick_start.sh.
// Requires a running compose stack; no in-proc setup().
describe('guides/up_quick_start', () => {
  // TODO: update to not use CLI
  it('works', async () => {
    await waitForNode(createAztecNodeClient(AZTEC_NODE_URL));
    execSync(`LOG_LEVEL=\${LOG_LEVEL:-verbose} AZTEC_NODE_URL=${AZTEC_NODE_URL} ./src/guides/up_quick_start.sh`, {
      shell: '/bin/bash',
      stdio: 'inherit',
    });
  });
});
