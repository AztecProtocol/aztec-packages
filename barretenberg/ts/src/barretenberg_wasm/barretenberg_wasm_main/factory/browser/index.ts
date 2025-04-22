import debug from 'debug';
import { readinessListener } from '../../../helpers/browser/index.js';

export async function createMainWorker() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const worker = new Worker(/* webpackMode: 'eager' */ new URL('./main.worker.js', import.meta.url), {
    type: 'module',
  });
  worker.onerror = e => console.error('Main worker error', e);
  const debugStr = debug.disable();
  debug.enable(debugStr);
  worker.postMessage({ debug: debugStr });
  console.log('Main worker created');
  await new Promise<void>(resolve => readinessListener(worker, resolve));
  console.log('Main worker ready');
  return worker;
}
