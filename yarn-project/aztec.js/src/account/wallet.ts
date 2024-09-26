import { type AuthWitness, type PXE } from '@aztec/circuit-types';

import { InteractionHandler } from '../interactions/index.js';
import { type IntentAction, type IntentInnerHash } from '../utils/authwit.js';
import { type AccountInterface } from './interface.js';

/**
 * The wallet interface.
 */
export type Wallet = InteractionHandler &
  AccountInterface &
  PXE & {
    createAuthWit(intent: IntentInnerHash | IntentAction): Promise<AuthWitness>;
  };
