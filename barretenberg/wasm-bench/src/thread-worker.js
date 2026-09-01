import { createImportObject } from './wasm-runtime.js';

let instance;
let memory;

self.addEventListener('message', async event => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      memory = message.memory;
      instance = await WebAssembly.instantiate(
        message.module,
        createImportObject({
          memory,
          logger: text => self.postMessage({ type: 'log', message: text }),
          envHardwareConcurrency: () => 1,
          threadSpawn: () => {
            throw new Error('WASM child threads cannot spawn nested threads.');
          },
        }),
      );
      self.postMessage({ type: 'ready' });
      return;
    }

    if (message.type === 'run') {
      instance.exports.wasi_thread_start(message.id >>> 0, message.arg >>> 0);
      return;
    }

    if (message.type === 'destroy') {
      self.close();
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message ?? String(error), stack: error?.stack ?? '' });
  }
});
