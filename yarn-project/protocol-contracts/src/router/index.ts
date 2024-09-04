import { AztecAddress, ROUTER_ADDRESS } from '@aztec/circuits.js';

import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { RouterArtifact } from './artifact.js';

/** Returns the canonical deployment of the router. */
export function getCanonicalRouter(): ProtocolContract {
  const contract = getCanonicalProtocolContract(RouterArtifact, 1);

  if (!contract.address.equals(RouterAddress)) {
    throw new Error(
      `Incorrect address for router (got ${contract.address.toString()} but expected ${RouterAddress.toString()}). Check ROUTER_ADDRESS is set to the correct value in the constants files and run the protocol-contracts package tests.`,
    );
  }
  return contract;
}

export function getCanonicalRouterAddress(): AztecAddress {
  return getCanonicalRouter().address;
}

export const RouterAddress = AztecAddress.fromBigInt(ROUTER_ADDRESS);
