// Guards the historical HandshakeRegistry archive; see the header of `historical.ts` for why superseded
// deployments are archived and what must be updated when a release changes the registry.
import { promises as fs } from 'fs';

import { STANDARD_CONTRACT_SALT, computeContractData } from '../contract_data.js';
import { HANDSHAKE_REGISTRY_V5_0_1_DATA } from './historical.js';

describe('historical handshake registries', () => {
  it('archived v5.0.1 artifact re-derives the recorded deployment data', async () => {
    const artifact = JSON.parse(await fs.readFile('./artifacts-historical/HandshakeRegistry-5.0.1.json', 'utf8'));
    const derived = await computeContractData(artifact);

    const derivedValues = {
      address: derived.address.toString(),
      // computeContractData derives the address assuming STANDARD_CONTRACT_SALT, so the recorded salt must equal it
      // for the archived instance's address preimage to be consistent.
      salt: STANDARD_CONTRACT_SALT.toString(),
      classId: derived.classId.toString(),
      artifactHash: derived.artifactHash.toString(),
      privateFunctionsRoot: derived.privateFunctionsRoot.toString(),
      publicBytecodeCommitment: derived.publicBytecodeCommitment.toString(),
      initializationHash: derived.initializationHash.toString(),
      privateFunctions: derived.privateFunctions.map(fn => ({
        selector: fn.selector.toField().toString(),
        vkHash: fn.vkHash.toString(),
      })),
    };
    const recordedValues = {
      address: HANDSHAKE_REGISTRY_V5_0_1_DATA.address.toString(),
      salt: HANDSHAKE_REGISTRY_V5_0_1_DATA.salt.toString(),
      classId: HANDSHAKE_REGISTRY_V5_0_1_DATA.classId.toString(),
      artifactHash: HANDSHAKE_REGISTRY_V5_0_1_DATA.artifactHash.toString(),
      privateFunctionsRoot: HANDSHAKE_REGISTRY_V5_0_1_DATA.privateFunctionsRoot.toString(),
      publicBytecodeCommitment: HANDSHAKE_REGISTRY_V5_0_1_DATA.publicBytecodeCommitment.toString(),
      initializationHash: HANDSHAKE_REGISTRY_V5_0_1_DATA.initializationHash.toString(),
      privateFunctions: HANDSHAKE_REGISTRY_V5_0_1_DATA.privateFunctions.map(fn => ({
        selector: fn.selector.toField().toString(),
        vkHash: fn.vkHash.toString(),
      })),
    };

    expect(derivedValues).toEqual(recordedValues);
  });
});
