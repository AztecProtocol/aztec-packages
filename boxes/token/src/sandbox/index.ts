import { createPXEClient, PXE } from '@aztec/aztec.js';

const { PXE_URL = 'http://localhost:8080' } = process.env;

export const waitForSandbox = async (pxe?: PXE) => {
    pxe = pxe ?? createPXEClient(PXE_URL);
    while (true) {
        try {
            await pxe!.getNodeInfo();
            return true;
        } catch (error) {
            await new Promise(resolve => {
                setTimeout(resolve, 1000);
            });
        }
    }
  };

// assumes sandbox is running locally, which this script does not trigger
// as well as anvil.  anvil can be started with yarn test:integration
export const setupSandbox = async () => {
    const pxe = createPXEClient(PXE_URL);
    await waitForSandbox(pxe);
    return pxe;
  };