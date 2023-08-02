import { parentPort } from 'worker_threads';

import { DispatchMsg, NodeListener, TransportServer } from '../../transport/index.js';
import { WasmModule } from '../../wasm/wasm_module.js';

if (!parentPort) {
  throw new Error('InvalidWorker');
}

/**
 * Start the transport server corresponding to this module.
 * @param module - The WasmModule to host.
 */
export function startNodeModule(module: WasmModule) {
  const dispatch = async ({ fn, args }: DispatchMsg) => {
    if (fn === '__destroyWorker__') {
      transportServer.stop();
      return;
    }
    if (!(module as any)[fn]) {
      throw new Error(`dispatch error, function not found: ${fn}`);
    }
    return await (module as any)[fn](...args);
  };
  const transportListener = new NodeListener();
  const transportServer = new TransportServer<DispatchMsg>(transportListener, dispatch);
  module.addLogger((...args: any[]) => transportServer.broadcast({ fn: 'emit', args: ['log', ...args] }));
  transportServer.start();
}
