import { parentPort } from 'worker_threads';
import { expose } from 'comlink';
import { BarretenbergWasmMain } from '../../index.js';
import { nodeEndpoint } from '../../../helpers/node/node_endpoint.js';
import { initLogger } from '../../../../log/node/index.js';

if (!parentPort) {
  throw new Error('No parentPort');
}

const endpoint = nodeEndpoint(parentPort);

endpoint.addEventListener('message', (e: any) => {
  if (e.data.log) {
    initLogger(e.data.log);
  }
});

expose(new BarretenbergWasmMain(), nodeEndpoint(parentPort));
