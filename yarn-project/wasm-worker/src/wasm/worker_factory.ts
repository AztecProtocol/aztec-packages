import { createDebugLogger } from '../log/index.js';
import { createNodeWorker } from './node/index.js';
import { createWebWorker } from './browser/index.js';
import isNode from 'detect-node';

export async function createWorker(id?: string, module?: WebAssembly.Module, initialMem?: number, maxMem?: number) {
  const worker = await (isNode ? createNodeWorker() : createWebWorker());
  const logger = createDebugLogger(id ? `bb:wasm:${id}` : 'bb:wasm');
  void worker.on('log', msg => logger(msg));
  try {
    await worker.init(module, initialMem, maxMem);
  } catch (err) {
    // TODO: WebKit can't currently marshal modules across worker boundary: https://bugs.webkit.org/show_bug.cgi?id=220038
    await worker.init(undefined, initialMem, maxMem);
  }
  return worker;
}
