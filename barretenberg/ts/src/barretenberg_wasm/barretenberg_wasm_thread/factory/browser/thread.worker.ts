import { expose } from 'comlink';
import { BarretenbergWasmThread } from '../../index.js';
import { Ready } from '../../../helpers/browser/index.js';

expose(new BarretenbergWasmThread());
postMessage(Ready);
