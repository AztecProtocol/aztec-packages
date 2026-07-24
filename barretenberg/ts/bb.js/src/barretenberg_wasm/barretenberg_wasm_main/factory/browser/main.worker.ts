import { expose } from 'comlink';

import { Ready } from '../../../helpers/browser/index.js';
import { BarretenbergWasmMain } from '../../index.js';

expose(new BarretenbergWasmMain());
postMessage(Ready);
