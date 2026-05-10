/**
 * Node worker_threads entrypoint that exposes a `BarretenbergWasmMain` over
 * comlink. The worker loads the Emscripten-emitted glue inside its own
 * isolate; pthreads spawned by the wasm module live as nested workers under
 * this one (Emscripten's standard pattern).
 */

import { parentPort } from 'worker_threads';
import { expose } from 'comlink';
import { BarretenbergWasmMain } from '../../index.js';
import { nodeEndpoint } from '../../../helpers/node/node_endpoint.js';

if (!parentPort) {
  throw new Error('No parentPort');
}

expose(new BarretenbergWasmMain(), nodeEndpoint(parentPort));
