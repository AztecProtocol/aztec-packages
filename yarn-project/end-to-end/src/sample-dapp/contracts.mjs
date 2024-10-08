// docs:start:imports
import { AztecAddress } from '@aztec/aztec.js';
// docs:end:imports
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { readFileSync } from 'fs';

// docs:start:get-tokens
export async function getToken(client) {
  const addresses = JSON.parse(readFileSync('addresses.json'));
  return TokenContract.at(AztecAddress.fromString(addresses.token), client);
}
// docs:end:get-tokens
