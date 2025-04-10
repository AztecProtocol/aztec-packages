import {
  type ContractInstanceWithAddress,
  type PXE,
  getContractInstanceFromDeployParams,
  SponsoredFeePaymentMethod,
  AztecAddress,
  Fr,
} from '@aztec/aztec.js';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';

export async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromDeployParams(SponsoredFPCContract.artifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  });
}

export async function getSponsoredFPCAddress(): Promise<AztecAddress> {
  return (await getSponsoredFPCInstance()).address;
}

export async function prepareForFeePayment(pxe: PXE): Promise<SponsoredFeePaymentMethod> {
  try {
    const sponsoredFPC = await getSponsoredFPCInstance();
    await pxe.registerContract({
      instance: sponsoredFPC,
      artifact: SponsoredFPCContract.artifact,
    });
    return new SponsoredFeePaymentMethod(sponsoredFPC.address);
  } catch (error) {
    console.error('Error preparing SponsoredFeePaymentMethod:', error);
    throw error;
  }
}
