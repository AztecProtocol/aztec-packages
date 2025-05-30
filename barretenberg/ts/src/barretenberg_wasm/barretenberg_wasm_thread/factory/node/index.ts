import { Worker } from 'worker_threads';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { logOptions } from '../../../../log/index.js';

function getCurrentDir() {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  } else {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return dirname(fileURLToPath(import.meta.url));
  }
}

export function createThreadWorker() {
  const __dirname = getCurrentDir();
  const worker = new Worker(__dirname + `/thread.worker.js`);
  worker.postMessage({ log: logOptions });
  return Promise.resolve(worker);
}
