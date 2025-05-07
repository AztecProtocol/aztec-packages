import { expose } from 'comlink';
import { BarretenbergWasmThread } from '../../index.js';
import debug from 'debug';
import { Ready } from '../../../helpers/browser/index.js';

addEventListener('message', e => {
  if (e.data.debug) {
    debug.enable(e.data.debug);
  }
});

expose(new BarretenbergWasmThread());
postMessage(Ready);
