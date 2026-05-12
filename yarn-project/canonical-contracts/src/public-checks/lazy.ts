import { Fr } from '@aztec/foundation/curves/bn254';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeInitializationHash, getContractClassFromArtifact } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

import { PUBLIC_CHECKS_ADDRESS, PUBLIC_CHECKS_CLASS_ID } from './address.gen.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getPublicChecksArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    // Cannot assert this import as it's incompatible with bundlers like vite
    // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
    // Even if now supported by al major browsers, the MIME type is replaced with
    // "text/javascript"
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    const { default: publicChecksJson } = await import('../../artifacts/PublicChecks.json');
    protocolContractArtifact = loadContractArtifact(publicChecksJson);
  }
  return protocolContractArtifact;
}

/** Returns the canonical deployment of public_checks. */
export async function getCanonicalPublicChecks(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const publicChecksArtifact = await getPublicChecksArtifact();
    const contractClass = await getContractClassFromArtifact(publicChecksArtifact);
    if (!contractClass.id.equals(PUBLIC_CHECKS_CLASS_ID)) {
      throw new Error(
        `public_checks artifact class id ${contractClass.id.toString()} does not match committed ` +
          `PUBLIC_CHECKS_CLASS_ID ${PUBLIC_CHECKS_CLASS_ID.toString()}; regenerate via ` +
          `\`yarn workspace @aztec/canonical-contracts run regen:public-checks-address\`.`,
      );
    }
    const constructorArtifact = publicChecksArtifact.functions.find(f => f.name === 'constructor');
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

    protocolContract = { instance, contractClass, artifact: publicChecksArtifact, address: PUBLIC_CHECKS_ADDRESS };
  }
  return protocolContract;
}
