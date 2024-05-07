import * as schnorrAccount from '@aztec/accounts/schnorr';
import * as singleKeyAccount from '@aztec/accounts/single_key';
import * as testingAccounts from '@aztec/accounts/testing';
import * as aztec from '@aztec/aztec.js';
import '@aztec/circuits.js';

import { Buffer } from 'buffer';

(window as any).AztecJs = {
  ...aztec,
  ...testingAccounts,
  ...singleKeyAccount,
  ...schnorrAccount,
  Buffer,
};
