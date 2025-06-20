import {
  type PXE,
  getContractInstanceFromDeployParams,
  SponsoredFeePaymentMethod,
  AztecAddress,
  Fr,
  loadContractArtifact,
  type ContractArtifact,
} from '@aztec/aztec.js';
import { SPONSORED_FPC_SALT } from '@aztec/constants';

export async function getSponsoredFPCArtifact(version?: string): Promise<ContractArtifact> {
  if (version) {
    const artifact = (await import(`../assets/artifacts/${version}/sponsored_fpc_contract-SponsoredFPC.json`)).default;
    return loadContractArtifact(artifact);
  } else {
    const contract = (await import('@aztec/noir-contracts.js/SponsoredFPC')).SponsoredFPCContract;
    return contract.artifact;
  }
}

export async function prepareForFeePayment(
  pxe: PXE,
  sponsoredFPCAddress?: AztecAddress,
  sponsoredFPCVersion?: string,
): Promise<SponsoredFeePaymentMethod> {
  try {
    const contractArtifact = await getSponsoredFPCArtifact(sponsoredFPCVersion);

    const instance = await getContractInstanceFromDeployParams(contractArtifact, {
      salt: new Fr(SPONSORED_FPC_SALT),
    });

    if (sponsoredFPCAddress && !sponsoredFPCAddress.equals(instance.address)) {
      throw new Error(
        `SponsoredFPC at version ${sponsoredFPCVersion} does not match the expected address. Computed ${instance.address} but received ${sponsoredFPCAddress}`,
      );
    }

    await pxe.registerContract({
      instance: instance,
      artifact: contractArtifact,
    });
    return new SponsoredFeePaymentMethod(instance.address);
  } catch (error) {
    console.error('Error preparing SponsoredFeePaymentMethod:', error);
    throw error;
  }
}
