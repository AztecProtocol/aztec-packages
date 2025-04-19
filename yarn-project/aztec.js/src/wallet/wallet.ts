import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecNode, PXE } from '@aztec/stdlib/interfaces/client';

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
    | 'updateContract'
    | 'registerSender'
    | 'getSenders'
    | 'removeSender'
    | 'getPrivateEvents'
    | 'getPublicEvents'
  > &
  Pick<AztecNode, 'getTxReceipt' | 'getCurrentBaseFees'> & {
    createAuthWit(intent: IntentInnerHash | IntentAction): Promise<AuthWitness>;
  };
