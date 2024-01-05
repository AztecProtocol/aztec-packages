import { createPXEClient } from '@aztec/aztec.js';
import { pxeTestSuite } from '@aztec/pxe';

import { waitForPXE } from './fixtures/utils.js';

const { PXE_URL = 'http://localhost:8080' } = process.env;

const setup = async () => {
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);
  return pxe;
};

pxeTestSuite('pxe_sandbox', setup);
