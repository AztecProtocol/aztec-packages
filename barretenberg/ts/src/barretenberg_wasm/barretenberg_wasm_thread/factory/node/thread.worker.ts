import { parentPort } from 'worker_threads';
import { expose } from 'comlink';
import { BarretenbergWasmThread } from '../../index.js';
import { nodeEndpoint } from '../../../helpers/node/node_endpoint.js';

if (!parentPort) {
  throw new Error('No parentPort');
}

// BarretenbergWasmBase pre-populates default stubs for the
// BBERG_WEBGPU_MSM_HOOK env imports. The native Pippenger path in pthread
// workers never invokes them; if BBERG_WEBGPU_MSM_HOOK is off, the imports
// don't exist and the stubs are simply unused.
expose(new BarretenbergWasmThread(), nodeEndpoint(parentPort));
