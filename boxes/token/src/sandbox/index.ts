import { createPXEClient, waitForPXE } from '@aztec/aztec.js';

const { PXE_URL = 'http://localhost:8080' } = process.env;

// assumes sandbox is running locally, which this script does not trigger
// as well as anvil.  anvil can be started with yarn test:integration
export const setupSandbox = async () => {
    const pxe = createPXEClient(PXE_URL);
    await waitForPXE(pxe);
    return pxe;
  };