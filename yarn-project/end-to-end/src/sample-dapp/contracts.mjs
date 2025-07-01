import { AztecAddress, Contract } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { readFileSync } from 'fs';

// This syntax is helpful for the referencing tutorial
const TokenContractArtifact = TokenContract.artifact;

// docs:start:get-tokens
export async function getToken(wallet) {
  const addresses = JSON.parse(readFileSync('addresses.json'));
  return Contract.at(AztecAddress.fromString(addresses.token), TokenContractArtifact, wallet);
}
// docs:end:get-tokens
