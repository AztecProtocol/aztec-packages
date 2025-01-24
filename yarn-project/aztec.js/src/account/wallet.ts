import { type AuthWitness, type PXE } from '@aztec/circuit-types';

import { type IntentCall, type IntentInnerHash } from '../utils/authwit.js';
import { type AccountInterface } from './interface.js';

/**
 * The wallet interface.
 */
export type Wallet = AccountInterface &
  PXE & {
    createAuthWit(intent: IntentInnerHash | IntentCall): Promise<AuthWitness>;
  };
