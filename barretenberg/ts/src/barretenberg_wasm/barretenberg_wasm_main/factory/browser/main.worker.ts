import { expose } from 'comlink';
import { BarretenbergWasmMain } from '../../index.js';
import { Ready } from '../../../helpers/browser/index.js';
import { initLogger } from '../../../../log/browser/index.js';

addEventListener('message', e => {
  if (e.data.log) {
    initLogger(e.data.log);
  }
});

addEventListener('error', e => {
  console.error('Main worker error:', e.error || e.message);
  console.error('Error details:', {
    message: e.message,
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
    error: e.error
  });
  if (e.error?.stack) {
    console.error('Stack trace:', e.error.stack);
  }
});

addEventListener('unhandledrejection', e => {
  console.error('Main worker unhandled rejection:', e.reason);
  if (e.reason?.stack) {
    console.error('Stack trace:', e.reason.stack);
  }
});

expose(new BarretenbergWasmMain());
postMessage(Ready);
