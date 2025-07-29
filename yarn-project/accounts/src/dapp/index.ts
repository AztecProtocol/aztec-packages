import { type Account, type AztecAddress, BaseAccount } from '@aztec/aztec.js';

import { DefaultDappInterface } from './dapp_interface.js';

export * from './dapp_interface.js';

export function createSubscriptionForAccount(account: Account, dappAddress: AztecAddress): Account {
  return new BaseAccount(DefaultDappInterface.createFromUserAccount(account, dappAddress));
}
