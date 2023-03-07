import { DispatchMsg, TransportServer, WorkerListener } from '../../transport/index.js';
import { WasmModule } from '../wasm_module.js';

async function dispatch({ fn, args }: DispatchMsg) {
  if (fn === '__destroyWorker__') {
    transportServer.stop();
    return;
  }
  if (!barretenbergWasm[fn]) {
    throw new Error(`dispatch error, function not found: ${fn}`);
  }
  return await barretenbergWasm[fn](...args);
}

const barretenbergWasm = new WasmModule();
const transportListener = new WorkerListener(self);
const transportServer = new TransportServer<DispatchMsg>(transportListener, dispatch);
barretenbergWasm.on('log', (...args: any[]) => transportServer.broadcast({ fn: 'emit', args: ['log', ...args] }));
transportServer.start();
