import { logOptions } from '../../../../log/index.js';
import { readinessListener } from '../../../helpers/browser/index.js';

export async function createThreadWorker() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const worker = new Worker(new URL('./thread.worker.js', import.meta.url), { type: 'module' });

  // Add error handler to catch worker crashes
  worker.onerror = (e) => {
    console.error('Thread worker crashed:', e.message);
    console.error('Error details:', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno
    });
  };

  worker.postMessage({ log: logOptions });
  await new Promise<void>(resolve => readinessListener(worker, resolve));
  return worker;
}
