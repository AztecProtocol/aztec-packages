import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeStandardContract, makeStandardContractFromData } from '../make_standard_contract.js';
import type { StandardContract } from '../standard_contract.js';
import { HANDSHAKE_REGISTRY_V5_0_1_DATA } from './historical.js';

export {
  HISTORICAL_STANDARD_HANDSHAKE_REGISTRY_ADDRESSES,
  STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
  STANDARD_HANDSHAKE_REGISTRY_CLASS_ID,
  STANDARD_HANDSHAKE_REGISTRY_SALT,
} from './constants.js';

let standardContract: StandardContract;
let standardContractArtifact: ContractArtifact;

export async function getHandshakeRegistryArtifact(): Promise<ContractArtifact> {
  if (!standardContractArtifact) {
    // Cannot assert this import as it's incompatible with bundlers like vite
    // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
    // Even if now supported by all major browsers, the MIME type is replaced with
    // "text/javascript"
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    const { default: handshakeRegistryJson } = await import('../../artifacts/HandshakeRegistry.json');
    standardContractArtifact = loadContractArtifact(handshakeRegistryJson);
  }
  return standardContractArtifact;
}

/** Returns the standard deployment of the handshake registry. */
export async function getStandardHandshakeRegistry(): Promise<StandardContract> {
  if (!standardContract) {
    const artifact = await getHandshakeRegistryArtifact();
    standardContract = makeStandardContract('HandshakeRegistry', artifact);
  }
  return standardContract;
}

let historicalStandardContracts: StandardContract[];

/** Returns superseded standard deployments of the handshake registry that remain live onchain. */
export async function getHistoricalStandardHandshakeRegistries(): Promise<StandardContract[]> {
  if (!historicalStandardContracts) {
    // Same bundler-compatible lazy import as `getHandshakeRegistryArtifact` above.
    const { default: handshakeRegistryV501Json } = await import(
      '../../artifacts-historical/HandshakeRegistry-5.0.1.json'
    );
    historicalStandardContracts = [
      makeStandardContractFromData(HANDSHAKE_REGISTRY_V5_0_1_DATA, loadContractArtifact(handshakeRegistryV501Json)),
    ];
  }
  return historicalStandardContracts;
}
