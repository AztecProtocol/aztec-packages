import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { PXE } from '@aztec/stdlib/interfaces/client';

import type { AccountInterface } from '../account/interface.js';
import type { IntentAction, IntentInnerHash } from '../utils/authwit.js';

/**
 * The wallet interface.
 */
export type Wallet = AccountInterface &
  PXE & {
    createAuthWit(intent: IntentInnerHash | IntentAction): Promise<AuthWitness>;
  };
