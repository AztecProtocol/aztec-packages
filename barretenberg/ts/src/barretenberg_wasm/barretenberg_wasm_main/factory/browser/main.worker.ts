import { expose } from 'comlink';
import { BarretenbergWasmMain } from '../../index.js';
import { Ready } from '../../../helpers/browser/index.js';
import { initLogger } from '../../../../log/browser/index.js';

addEventListener('message', e => {
  if (e.data.log) {
    initLogger(e.data.log);
  }
});

expose(new BarretenbergWasmMain());
postMessage(Ready);
