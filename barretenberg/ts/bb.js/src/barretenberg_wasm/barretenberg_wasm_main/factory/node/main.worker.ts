import { expose } from 'comlink';
import { parentPort } from 'worker_threads';

import { nodeEndpoint } from '../../../helpers/node/node_endpoint.js';
import { BarretenbergWasmMain } from '../../index.js';

if (!parentPort) {
  throw new Error('No parentPort');
}

expose(new BarretenbergWasmMain(), nodeEndpoint(parentPort));
