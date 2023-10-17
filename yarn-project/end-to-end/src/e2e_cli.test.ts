import { PXE, createDebugLogger } from '@aztec/aztec.js';

import { cliTestSuite } from './canary/cli.js';
import { setup as e2eSetup } from './fixtures/utils.js';

const { PXE_URL } = process.env;
const debug = createDebugLogger('aztec:e2e_cli');

let pxe: PXE;
let teardown: () => Promise<void>;

const testSetup = async () => {
  const context = await e2eSetup(2);
  debug(`Environment set up`);
  ({ pxe, teardown } = context);
  return pxe;
};

const testCleanup = async () => {
  await teardown();
};

cliTestSuite('E2E CLI Test', testSetup, testCleanup, createDebugLogger('aztec:e2e_cli'), PXE_URL);
