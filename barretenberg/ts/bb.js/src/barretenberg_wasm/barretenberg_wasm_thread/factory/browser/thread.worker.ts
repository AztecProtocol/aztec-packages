import { expose } from 'comlink';

import { Ready } from '../../../helpers/browser/index.js';
import { BarretenbergWasmThread } from '../../index.js';

expose(new BarretenbergWasmThread());
postMessage(Ready);
