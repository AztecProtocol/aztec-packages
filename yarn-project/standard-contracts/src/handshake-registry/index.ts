import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import HandshakeRegistryV501Json from '../../artifacts-historical/HandshakeRegistry-5.0.1.json' with { type: 'json' };
import HandshakeRegistryJson from '../../artifacts/HandshakeRegistry.json' with { type: 'json' };
import { makeStandardContract, makeStandardContractFromData } from '../make_standard_contract.js';
import type { StandardContract } from '../standard_contract.js';
import { HANDSHAKE_REGISTRY_V5_0_1_DATA } from './historical.js';

export {
  HISTORICAL_STANDARD_HANDSHAKE_REGISTRY_ADDRESSES,
  INTERACTIVE_HANDSHAKE_REQUEST_KIND,
  STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
  STANDARD_HANDSHAKE_REGISTRY_CLASS_ID,
  STANDARD_HANDSHAKE_REGISTRY_SALT,
} from './constants.js';

export const HandshakeRegistryArtifact = loadContractArtifact(HandshakeRegistryJson as NoirCompiledContract);

let standardContract: StandardContract;

/** Returns the standard deployment of the handshake registry. */
export function getStandardHandshakeRegistry(): Promise<StandardContract> {
  if (!standardContract) {
    standardContract = makeStandardContract('HandshakeRegistry', HandshakeRegistryArtifact);
  }
  return Promise.resolve(standardContract);
}

let historicalStandardContracts: StandardContract[];

/** Returns superseded standard deployments of the handshake registry that remain live onchain. */
export function getHistoricalStandardHandshakeRegistries(): Promise<StandardContract[]> {
  if (!historicalStandardContracts) {
    historicalStandardContracts = [
      makeStandardContractFromData(
        HANDSHAKE_REGISTRY_V5_0_1_DATA,
        loadContractArtifact(HandshakeRegistryV501Json as NoirCompiledContract),
      ),
    ];
  }
  return Promise.resolve(historicalStandardContracts);
}
