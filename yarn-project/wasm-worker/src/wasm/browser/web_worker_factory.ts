import { WasmModule } from '../wasm_module.js';
import { createDispatchProxy, DispatchMsg, TransportClient, WorkerConnector } from '../../transport/index.js';
import { BarretenbergWorker } from '../barretenberg_worker.js';

export async function createWebWorker() {
  const worker = new Worker(`/web_worker.js`);
  const transportConnect = new WorkerConnector(worker);
  const transportClient = new TransportClient<DispatchMsg>(transportConnect);
  await transportClient.open();
  const barretenbergWorker = createDispatchProxy(WasmModule, transportClient);
  const destroyWorker = async () => {
    await transportClient.request({ fn: '__destroyWorker__', args: [] });
    transportClient.close();
  };
  barretenbergWorker['destroyWorker'] = destroyWorker;
  return barretenbergWorker as BarretenbergWorker;
}
