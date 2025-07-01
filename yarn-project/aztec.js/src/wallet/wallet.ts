import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { PXE } from '@aztec/stdlib/interfaces/client';

import type { AccountInterface } from '../account/interface.js';
import type { IntentAction, IntentInnerHash } from '../utils/authwit.js';

/**
 * The wallet interface.
 */
export type Wallet = AccountInterface &
  Pick<
    PXE,
    | 'simulateTx'
    | 'simulateUtility'
    | 'profileTx'
    | 'sendTx'
    | 'getContractClassMetadata'
    | 'getContractMetadata'
    | 'registerContract'
    | 'registerContractClass'
    | 'proveTx'
    | 'getNodeInfo'
    | 'getPXEInfo'
    | 'getCurrentBaseFees'
    | 'updateContract'
    | 'registerSender'
    | 'getSenders'
    | 'removeSender'
    | 'getTxReceipt'
    | 'getPrivateEvents'
    | 'getPublicEvents'
  > & {
    createAuthWit(intent: IntentInnerHash | IntentAction): Promise<AuthWitness>;
  };
