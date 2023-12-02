import { PXE } from '@aztec/types';

import { AccountInterface } from '../account/index.js';

/**
 * The wallet interface.
 */
export type Wallet = AccountInterface & PXE;
