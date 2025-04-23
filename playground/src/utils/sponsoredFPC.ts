import {
  type ContractInstanceWithAddress,
  type PXE,
  getContractInstanceFromDeployParams,
  SponsoredFeePaymentMethod,
  AztecAddress,
  Fr,
  type NoirCompiledContract,
  loadContractArtifact,
} from '@aztec/aztec.js';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';

export async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromDeployParams(SponsoredFPCContract.artifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  });
}

export async function prepareForFeePayment(pxe: PXE, sponsoredFPCAddress?: AztecAddress, sponsoredFPCContractArtifact?: NoirCompiledContract): Promise<SponsoredFeePaymentMethod> {
  try {
    let sponsoredFPC: ContractInstanceWithAddress;
    let contractArtifact = SponsoredFPCContract.artifact;

    if (sponsoredFPCAddress && sponsoredFPCContractArtifact) {
      contractArtifact = loadContractArtifact(sponsoredFPCContractArtifact);
      sponsoredFPC = await getContractInstanceFromDeployParams(contractArtifact, {
        salt: new Fr(SPONSORED_FPC_SALT),
      });
      sponsoredFPC.address = sponsoredFPCAddress;
    } else {
      sponsoredFPC = await getSponsoredFPCInstance();
    }

    await pxe.registerContract({
      instance: sponsoredFPC,
      artifact: contractArtifact,
    });
    return new SponsoredFeePaymentMethod(sponsoredFPC.address);
  } catch (error) {
    console.error('Error preparing SponsoredFeePaymentMethod:', error);
    throw error;
  }
}
