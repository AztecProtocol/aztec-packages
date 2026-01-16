import { expose } from 'comlink';
import { BarretenbergWasmMain } from '../../index.js';
import { Ready } from '../../../helpers/browser/index.js';

expose(new BarretenbergWasmMain());
postMessage(Ready);
