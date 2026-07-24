import { expose } from 'comlink';
import { parentPort } from 'worker_threads';

import { nodeEndpoint } from '../../../helpers/node/node_endpoint.js';
import { BarretenbergWasmThread } from '../../index.js';

if (!parentPort) {
  throw new Error('No parentPort');
}

const endpoint = nodeEndpoint(parentPort);

expose(new BarretenbergWasmThread(), endpoint);
