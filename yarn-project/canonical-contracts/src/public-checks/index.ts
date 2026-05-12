import { Fr } from '@aztec/foundation/curves/bn254';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeInitializationHash, getContractClassFromArtifact } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import PublicChecksJson from '../../artifacts/PublicChecks.json' with { type: 'json' };
import { PUBLIC_CHECKS_ADDRESS, PUBLIC_CHECKS_CLASS_ID } from './address.gen.js';

export { PUBLIC_CHECKS_ADDRESS, PUBLIC_CHECKS_CLASS_ID } from './address.gen.js';

let protocolContract: ProtocolContract;

export const PublicChecksArtifact: ContractArtifact = loadContractArtifact(PublicChecksJson as NoirCompiledContract);

/** Returns the canonical deployment of public_checks. */
export async function getCanonicalPublicChecks(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await buildPublicChecksProtocolContract(PublicChecksArtifact);
  }
  return protocolContract;
}

async function buildPublicChecksProtocolContract(artifact: ContractArtifact): Promise<ProtocolContract> {
  const contractClass = await getContractClassFromArtifact(artifact);
  if (!contractClass.id.equals(PUBLIC_CHECKS_CLASS_ID)) {
    throw new Error(
      `public_checks artifact class id ${contractClass.id.toString()} does not match committed ` +
        `PUBLIC_CHECKS_CLASS_ID ${PUBLIC_CHECKS_CLASS_ID.toString()}; regenerate via ` +
        `\`yarn workspace @aztec/canonical-contracts run regen:public-checks-address\`.`,
    );
  }
  const constructorArtifact = artifact.functions.find(f => f.name === 'constructor');
  const initializationHash = await computeInitializationHash(constructorArtifact, []);

  const instance = {
    version: 1 as const,
    currentContractClassId: PUBLIC_CHECKS_CLASS_ID,
    originalContractClassId: PUBLIC_CHECKS_CLASS_ID,
    initializationHash,
    publicKeys: PublicKeys.default(),
    salt: new Fr(1),
    deployer: AztecAddress.ZERO,
    address: PUBLIC_CHECKS_ADDRESS,
  };

  return { instance, contractClass, artifact, address: PUBLIC_CHECKS_ADDRESS };
}
