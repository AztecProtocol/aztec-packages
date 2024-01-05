import { createDebugLogger, createPXEClient, fileURLToPath } from '@aztec/aztec.js';

import Koa from 'koa';
import serve from 'koa-static';
import path, { dirname } from 'path';

import { setup } from './fixtures/utils.js';
import { browserTestSuite } from './shared/browser.js';
import { createPXERpcServer } from '@aztec/pxe';

const { PXE_URL = '' } = process.env;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = 3000;
const PXE_PORT = 3001

const logger = createDebugLogger('aztec:canary_aztec.js:web');
const pageLogger = createDebugLogger('aztec:canary_aztec.js:web:page');

const setupApp = async () => {
  const { pxe: pxeService } = await setup(1);
  let pxe = pxeService;
  if (!PXE_URL) {
    const pxeRPCServer = createPXERpcServer(pxeService);
    pxeRPCServer.start(PXE_PORT);
    pxe = createPXEClient(`http://localhost:${PXE_PORT}`);
  }

  const app = new Koa();
  app.use(serve(path.resolve(__dirname, './web')));
  const server = app.listen(PORT, () => {
    logger(`Web Server started at http://localhost:${PORT}`);
  });

  return { server, pxe };
};

browserTestSuite(setupApp, pageLogger);
